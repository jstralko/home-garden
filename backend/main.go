package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"mime"
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
	Mode   string     `json:"mode"`
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
	username  string
	key       string
	client    *http.Client
	cacheTTL  time.Duration
	cache     feedCache
	luxCache  luxHistoryCache
	soilCache luxHistoryCache
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
	mux.HandleFunc("GET /api/feeds/soil-percent/day", s.handleSoilPercentDay)
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
	s.handleFeedHistory(w, r, feedConfig{key: "lux", endpoint: "lux"}, &s.luxCache)
}

func (s *server) handleSoilPercentDay(w http.ResponseWriter, r *http.Request) {
	s.handleFeedHistory(w, r, feedConfig{key: "soil_percent", endpoint: "soil-percent"}, &s.soilCache)
}

func (s *server) handleFeedHistory(w http.ResponseWriter, r *http.Request, feed feedConfig, cache *luxHistoryCache) {
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
	mode := readHistoryMode(r)
	cacheKey := fmt.Sprintf("%s:%s", mode, feed.key)
	if data, ok := s.cachedHistory(cache, cacheKey, startKey, endKey); ok {
		writeJSON(w, http.StatusOK, data)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
	defer cancel()

	points, err := s.fetchFeedHistory(ctx, feed, start, end)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	if mode == "month" {
		points = aggregateDaily(points, start, end)
	}

	response := luxDayResponse{Points: points, Mode: mode}
	s.storeCachedHistory(cache, cacheKey, startKey, endKey, response)
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

func (s *server) cachedHistory(cache *luxHistoryCache, key string, start string, end string) (luxDayResponse, bool) {
	cache.mu.Lock()
	defer cache.mu.Unlock()

	if time.Now().After(cache.expires) || cache.start != key || cache.end != start+"|"+end {
		return luxDayResponse{}, false
	}

	return cache.data, true
}

func (s *server) storeCachedHistory(cache *luxHistoryCache, key string, start string, end string, data luxDayResponse) {
	cache.mu.Lock()
	defer cache.mu.Unlock()

	cache.start = key
	cache.end = start + "|" + end
	cache.data = data
	cache.expires = time.Now().Add(s.cacheTTL)
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

func readHistoryMode(r *http.Request) string {
	mode := strings.TrimSpace(r.URL.Query().Get("mode"))
	if mode == "month" {
		return "month"
	}

	return "12h"
}

func aggregateDaily(points []luxPoint, start time.Time, end time.Time) []luxPoint {
	type bucket struct {
		sum   float64
		count int
	}

	buckets := map[string]bucket{}
	for _, point := range points {
		timestamp, err := time.Parse(time.RFC3339Nano, point.UpdatedAt)
		if err != nil || timestamp.Before(start) || !timestamp.Before(end) {
			continue
		}

		key := timestamp.Format("2006-01-02")
		current := buckets[key]
		current.sum += point.Value
		current.count += 1
		buckets[key] = current
	}

	keys := make([]string, 0, len(buckets))
	for key := range buckets {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	aggregated := make([]luxPoint, 0, len(keys))
	for _, key := range keys {
		current := buckets[key]
		if current.count == 0 {
			continue
		}

		aggregated = append(aggregated, luxPoint{
			Value:     current.sum / float64(current.count),
			UpdatedAt: key + "T12:00:00Z",
		})
	}

	return aggregated
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
	fileServer := http.FileServer(http.Dir(dist))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := filepath.Clean(r.URL.Path)
		if path == "." || path == "/" {
			w.Header().Set("Cache-Control", "no-cache")
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			fileServer.ServeHTTP(w, r)
			return
		}

		if strings.HasPrefix(path, "/assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}

		if contentType := contentTypeForPath(path); contentType != "" {
			w.Header().Set("Content-Type", contentType)
		}

		fileServer.ServeHTTP(w, r)
	})
}

func hasIndexHTML(dist string) bool {
	if dist == "" {
		return false
	}

	info, err := os.Stat(filepath.Join(dist, "index.html"))
	return err == nil && !info.IsDir()
}

func contentTypeForPath(path string) string {
	switch filepath.Ext(path) {
	case ".css":
		return "text/css; charset=utf-8"
	case ".js", ".mjs":
		return "text/javascript; charset=utf-8"
	case ".html":
		return "text/html; charset=utf-8"
	case ".json":
		return "application/json; charset=utf-8"
	case ".svg":
		return "image/svg+xml"
	}

	return mime.TypeByExtension(filepath.Ext(path))
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
