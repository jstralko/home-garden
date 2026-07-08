#pragma once

#define DEEP_SLEEP_MODE true
#define LOW_POWER_MODE false

const uint64_t DEEP_SLEEP_INTERVAL_US = 15ULL * 60ULL * 1000000ULL;
// Debug values: reduce these after deep sleep wake/upload behavior is verified.
// Suggested production values: display 2000-5000 ms, serial wait 0 ms.
const unsigned long DEEP_SLEEP_DISPLAY_TIME = 5000;
const unsigned long SERIAL_DEBUG_WAIT_MS = 8000;
const unsigned long TELEMETRY_CONNECT_TIMEOUT_DEEP_SLEEP = 30000;
const unsigned long TELEMETRY_CONNECT_TIMEOUT_NORMAL = 20000;
const unsigned long TELEMETRY_PUBLISH_FLUSH_MS = 3000;

const unsigned long SENSOR_INTERVAL_NORMAL = 3000;
const unsigned long SENSOR_INTERVAL_LOW_POWER = 60000;

const unsigned long UPLOAD_INTERVAL_NORMAL = 30000;
const unsigned long UPLOAD_INTERVAL_LOW_POWER = 300000; // 5 min
