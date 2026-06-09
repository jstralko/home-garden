#pragma once

#define DEEP_SLEEP_MODE true
#define LOW_POWER_MODE true

const uint64_t DEEP_SLEEP_INTERVAL_US = 5ULL * 60ULL * 1000000ULL;
const unsigned long DEEP_SLEEP_DISPLAY_TIME = 2000;
const unsigned long TELEMETRY_CONNECT_TIMEOUT_DEEP_SLEEP = 10000;
const unsigned long TELEMETRY_CONNECT_TIMEOUT_NORMAL = 20000;

const unsigned long SENSOR_INTERVAL_NORMAL = 3000;
const unsigned long SENSOR_INTERVAL_LOW_POWER = 60000;

const unsigned long UPLOAD_INTERVAL_NORMAL = 30000;
const unsigned long UPLOAD_INTERVAL_LOW_POWER = 300000; // 5 min
