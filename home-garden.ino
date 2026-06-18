#include "secrets.h"
#include "display.h"
#include "sensors.h"
#include "telemetry.h"
#include "config.h"

#include <esp_sleep.h>

unsigned long lastSensorRead = 0;
unsigned long lastMarqueeMove = 0;

const unsigned long sensorInterval =
  LOW_POWER_MODE ? SENSOR_INTERVAL_LOW_POWER : SENSOR_INTERVAL_NORMAL;

const unsigned long marqueeInterval =
  LOW_POWER_MODE ? 0 : 35;

void refreshDashboard() {
  drawTemperature(currentTempF, currentTempC);
  drawBatteryInfo(batteryVoltage, batteryPercent);
  drawLux(lux);
  drawSoil(soilRaw, soilVoltage, soilPercent);
  drawStatusBar(bmeFound, vemlFound, soilFound, fuelGaugeFound, wifiConnected, ioConnected);
}

void enterDeepSleep() {
  Serial.print("Sleeping for ");
  Serial.print(DEEP_SLEEP_INTERVAL_US / 1000000ULL);
  Serial.println(" seconds");

  shutdownTelemetry();
  shutdownSensors();
  sleepDisplay();

  Serial.flush();
  esp_sleep_enable_timer_wakeup(DEEP_SLEEP_INTERVAL_US);
  esp_deep_sleep_start();
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  initDisplay();
  bootScreen();

  initSensors();
  readSensors();
  lastSensorRead = millis();

  bool telemetryReady = initTelemetry();

  if (DEEP_SLEEP_MODE) {
    drawStaticDashboard();
    refreshDashboard();

    if (telemetryReady) {
      uploadTelemetryNow();
      runTelemetry();
    }

    delay(DEEP_SLEEP_DISPLAY_TIME);
    enterDeepSleep();
  }

  drawStaticDashboard();
  refreshDashboard();

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
