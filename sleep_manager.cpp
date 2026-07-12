#include "sleep_manager.h"

#include <Arduino.h>
#include <esp_sleep.h>

#include "config.h"
#include "diagnostics.h"
#include "display.h"
#include "sensors.h"
#include "telemetry.h"

void enterDeepSleep() {
  logSleepStart();

  shutdownTelemetry();
  shutdownSensors();
  sleepDisplay();

  Serial.flush();
  esp_sleep_enable_timer_wakeup(DEEP_SLEEP_INTERVAL_US);
  esp_deep_sleep_start();
}
