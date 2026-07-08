package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
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

type adafruitLastData struct {
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
}

type feedCache struct {
	mu      sync.Mutex
	data    latestFeedsResponse
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
	if dist == "" {
		return "../frontend/dist"
	}

	return dist
}

func staticHandler(dist string) http.Handler {
	if _, err := os.Stat(dist); errors.Is(err, os.ErrNotExist) {
		return http.NotFoundHandler()
	}

	return http.FileServer(http.Dir(dist))
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
