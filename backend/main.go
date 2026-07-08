package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type feedConfig struct {
	key      string
	endpoint string
}

type feedData struct {
	Value     *float64 `json:"value"`
	UpdatedAt *string  `json:"updatedAt"`
}

type latestFeedsResponse struct {
	Feeds map[string]feedData `json:"feeds"`
}

type luxPoint struct {
	Value     float64 `json:"value"`
	UpdatedAt string  `json:"updatedAt"`
}

type luxDayResponse struct {
	Points []luxPoint `json:"points"`
}

type adafruitLastData struct {
	Value     string `json:"value"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

type adafruitDataPoint struct {
	Value     string `json:"value"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

var feeds = []feedConfig{
	{key: "temperature", endpoint: "temperature"},
	{key: "humidity", endpoint: "humidity"},
	{key: "pressure", endpoint: "pressure"},
	{key: "gas", endpoint: "gas"},
	{key: "lux", endpoint: "lux"},
	{key: "soil_raw", endpoint: "soil-raw"},
	{key: "soil_voltage", endpoint: "soil-voltage"},
	{key: "soil_percent", endpoint: "soil-percent"},
	{key: "battery_voltage", endpoint: "battery-voltage"},
	{key: "battery_percent", endpoint: "battery-percent"},
}

type server struct {
	username string
	key      string
	client   *http.Client
	cacheTTL time.Duration
	cache    feedCache
	luxCache luxHistoryCache
}

type feedCache struct {
	mu      sync.Mutex
	data    latestFeedsResponse
	expires time.Time
}

type luxHistoryCache struct {
	mu      sync.Mutex
	start   string
	end     string
	data    luxDayResponse
	expires time.Time
}

func main() {
	username := strings.TrimSpace(os.Getenv("ADAFRUIT_IO_USERNAME"))
	key := strings.TrimSpace(os.Getenv("ADAFRUIT_IO_KEY"))
	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = "8080"
	}

	s := &server{
		username: username,
		key:      key,
		cacheTTL: readCacheTTL(),
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", s.handleHealth)
	mux.HandleFunc("GET /api/feeds/latest", s.handleLatestFeeds)
	mux.HandleFunc("GET /api/feeds/lux/day", s.handleLuxDay)
	mux.Handle("/", staticHandler(readFrontendDist()))

	addr := ":" + port
	log.Printf("home-garden backend listening on http://localhost%s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

func (s *server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]bool{
		"configured": s.configured(),
	})
}

func (s *server) handleLatestFeeds(w http.ResponseWriter, r *http.Request) {
	if !s.configured() {
		writeError(w, http.StatusServiceUnavailable, "ADAFRUIT_IO_USERNAME and ADAFRUIT_IO_KEY must be set on the backend")
		return
	}

	if data, ok := s.cachedFeeds(); ok {
		writeJSON(w, http.StatusOK, data)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
	defer cancel()

	result := latestFeedsResponse{
		Feeds: make(map[string]feedData, len(feeds)),
	}

	for _, feed := range feeds {
		data, err := s.fetchFeed(ctx, feed)
		if err != nil {
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}
		result.Feeds[feed.key] = data
	}

	s.storeCachedFeeds(result)
	writeJSON(w, http.StatusOK, result)
}

func (s *server) handleLuxDay(w http.ResponseWriter, r *http.Request) {
	if !s.configured() {
		writeError(w, http.StatusServiceUnavailable, "ADAFRUIT_IO_USERNAME and ADAFRUIT_IO_KEY must be set on the backend")
		return
	}

	start, end, err := parseTimeRange(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	startKey := start.Format(time.RFC3339Nano)
	endKey := end.Format(time.RFC3339Nano)
	if data, ok := s.cachedLuxHistory(startKey, endKey); ok {
		writeJSON(w, http.StatusOK, data)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
	defer cancel()

	points, err := s.fetchFeedHistory(ctx, feedConfig{key: "lux", endpoint: "lux"}, start, end)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	response := luxDayResponse{Points: points}
	s.storeCachedLuxHistory(startKey, endKey, response)
	writeJSON(w, http.StatusOK, response)
}

func (s *server) configured() bool {
	return s.username != "" && s.key != ""
}

func (s *server) cachedFeeds() (latestFeedsResponse, bool) {
	s.cache.mu.Lock()
	defer s.cache.mu.Unlock()

	if time.Now().After(s.cache.expires) || s.cache.data.Feeds == nil {
		return latestFeedsResponse{}, false
	}

	return s.cache.data, true
}

func (s *server) storeCachedFeeds(data latestFeedsResponse) {
	s.cache.mu.Lock()
	defer s.cache.mu.Unlock()

	s.cache.data = data
	s.cache.expires = time.Now().Add(s.cacheTTL)
}

func (s *server) cachedLuxHistory(start string, end string) (luxDayResponse, bool) {
	s.luxCache.mu.Lock()
	defer s.luxCache.mu.Unlock()

	if time.Now().After(s.luxCache.expires) || s.luxCache.start != start || s.luxCache.end != end {
		return luxDayResponse{}, false
	}

	return s.luxCache.data, true
}

func (s *server) storeCachedLuxHistory(start string, end string, data luxDayResponse) {
	s.luxCache.mu.Lock()
	defer s.luxCache.mu.Unlock()

	s.luxCache.start = start
	s.luxCache.end = end
	s.luxCache.data = data
	s.luxCache.expires = time.Now().Add(s.cacheTTL)
}

func (s *server) fetchFeed(ctx context.Context, feed feedConfig) (feedData, error) {
	feedURL := fmt.Sprintf(
		"https://io.adafruit.com/api/v2/%s/feeds/%s/data/last",
		url.PathEscape(s.username),
		url.PathEscape(feed.endpoint),
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, feedURL, nil)
	if err != nil {
		return feedData{}, err
	}
	req.Header.Set("X-AIO-Key", s.key)

	resp, err := s.client.Do(req)
	if err != nil {
		return feedData{}, fmt.Errorf("%s: %w", feed.endpoint, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return feedData{}, fmt.Errorf("%s: Adafruit IO returned %d", feed.endpoint, resp.StatusCode)
	}

	var payload adafruitLastData
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return feedData{}, fmt.Errorf("%s: decode response: %w", feed.endpoint, err)
	}

	value, err := parseOptionalFloat(payload.Value)
	if err != nil {
		return feedData{}, fmt.Errorf("%s: parse value: %w", feed.endpoint, err)
	}

	updatedAt := payload.CreatedAt
	if updatedAt == "" {
		updatedAt = payload.UpdatedAt
	}

	data := feedData{
		Value: value,
	}
	if updatedAt != "" {
		data.UpdatedAt = &updatedAt
	}

	return data, nil
}

func (s *server) fetchFeedHistory(ctx context.Context, feed feedConfig, start time.Time, end time.Time) ([]luxPoint, error) {
	feedURL := fmt.Sprintf(
		"https://io.adafruit.com/api/v2/%s/feeds/%s/data?limit=1000",
		url.PathEscape(s.username),
		url.PathEscape(feed.endpoint),
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, feedURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-AIO-Key", s.key)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%s history: %w", feed.endpoint, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return nil, fmt.Errorf("%s history: Adafruit IO returned %d", feed.endpoint, resp.StatusCode)
	}

	var payload []adafruitDataPoint
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("%s history: decode response: %w", feed.endpoint, err)
	}

	points := make([]luxPoint, 0, len(payload))
	for _, item := range payload {
		value, err := parseOptionalFloat(item.Value)
		if err != nil || value == nil {
			continue
		}

		updatedAt := item.CreatedAt
		if updatedAt == "" {
			updatedAt = item.UpdatedAt
		}
		timestamp, err := time.Parse(time.RFC3339Nano, updatedAt)
		if err != nil || timestamp.Before(start) || !timestamp.Before(end) {
			continue
		}

		points = append(points, luxPoint{
			Value:     *value,
			UpdatedAt: updatedAt,
		})
	}

	sort.Slice(points, func(i int, j int) bool {
		return points[i].UpdatedAt < points[j].UpdatedAt
	})

	return points, nil
}

func parseOptionalFloat(value string) (*float64, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}

	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return nil, err
	}

	return &parsed, nil
}

func parseTimeRange(r *http.Request) (time.Time, time.Time, error) {
	startRaw := strings.TrimSpace(r.URL.Query().Get("start"))
	endRaw := strings.TrimSpace(r.URL.Query().Get("end"))
	if startRaw == "" || endRaw == "" {
		return time.Time{}, time.Time{}, fmt.Errorf("start and end query parameters are required")
	}

	start, err := time.Parse(time.RFC3339Nano, startRaw)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("invalid start timestamp")
	}

	end, err := time.Parse(time.RFC3339Nano, endRaw)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("invalid end timestamp")
	}

	if !start.Before(end) {
		return time.Time{}, time.Time{}, fmt.Errorf("start must be before end")
	}

	return start, end, nil
}

func readCacheTTL() time.Duration {
	raw := strings.TrimSpace(os.Getenv("FEED_CACHE_TTL_SECONDS"))
	if raw == "" {
		return 30 * time.Second
	}

	seconds, err := strconv.Atoi(raw)
	if err != nil || seconds < 1 {
		log.Printf("invalid FEED_CACHE_TTL_SECONDS=%q, using 30 seconds", raw)
		return 30 * time.Second
	}

	return time.Duration(seconds) * time.Second
}

func readFrontendDist() string {
	dist := strings.TrimSpace(os.Getenv("FRONTEND_DIST"))
	if dist != "" {
		return dist
	}

	candidates := []string{
		"/app/frontend/dist",
		"frontend/dist",
		"../frontend/dist",
	}

	for _, candidate := range candidates {
		if hasIndexHTML(candidate) {
			return candidate
		}
	}

	return candidates[0]
}

func staticHandler(dist string) http.Handler {
	if !hasIndexHTML(dist) {
		log.Printf("frontend dist not found at %q", dist)
		return http.NotFoundHandler()
	}

	log.Printf("serving frontend from %q", dist)
	return http.FileServer(http.Dir(dist))
}

func hasIndexHTML(dist string) bool {
	if dist == "" {
		return false
	}

	info, err := os.Stat(filepath.Join(dist, "index.html"))
	return err == nil && !info.IsDir()
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("write response: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{
		"error": message,
	})
}
