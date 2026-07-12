#include "config.h"
#include "diagnostics.h"
#include "display.h"
#include "sensors.h"
#include "sleep_manager.h"
#include "telemetry.h"

unsigned long lastSensorRead = 0;
unsigned long lastMarqueeMove = 0;

const unsigned long sensorInterval =
    LOW_POWER_MODE ? SENSOR_INTERVAL_LOW_POWER : SENSOR_INTERVAL_NORMAL;

const unsigned long marqueeInterval = LOW_POWER_MODE ? 0 : 35;

void setup() {
  initializeDiagnostics();
  logWakeDiagnostics();

  initDisplay();
  bootScreen();

  initSensors();
  readSensors();
  lastSensorRead = millis();

  bool telemetryReady = initTelemetry();

  drawStaticDashboard();
  refreshDashboard();

  if (DEEP_SLEEP_MODE) {
    if (telemetryReady) {
      uploadTelemetryNow();
      runTelemetry();
    }

    delay(DEEP_SLEEP_DISPLAY_TIME);
    enterDeepSleep();
  }

  if (LOW_POWER_MODE) {
    delay(5000);
    setDisplayPower(false);
  }
}

void loop() {
  unsigned long now = millis();

  if (now - lastSensorRead >= sensorInterval) {
    lastSensorRead = now;
    runTelemetry();
    readSensors();
    refreshDashboard();
    uploadTelemetryIfDue();
  }

  if (!LOW_POWER_MODE && now - lastMarqueeMove >= marqueeInterval) {
    lastMarqueeMove = now;
    drawMarquee();
  }

  if (LOW_POWER_MODE) {
    delay(50);
  }
}
