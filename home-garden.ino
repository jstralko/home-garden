#include "secrets.h"
#include "display.h"
#include "sensors.h"
#include "telemetry.h"
#include "config.h"

#include <esp_sleep.h>

RTC_DATA_ATTR unsigned long bootCount = 0;

unsigned long lastSensorRead = 0;
unsigned long lastMarqueeMove = 0;

const unsigned long sensorInterval =
  LOW_POWER_MODE ? SENSOR_INTERVAL_LOW_POWER : SENSOR_INTERVAL_NORMAL;

const unsigned long marqueeInterval =
  LOW_POWER_MODE ? 0 : 35;

const char* wakeCauseName(esp_sleep_wakeup_cause_t cause) {
  switch (cause) {
    case ESP_SLEEP_WAKEUP_TIMER:
      return "timer";
    case ESP_SLEEP_WAKEUP_EXT0:
      return "external RTC_IO";
    case ESP_SLEEP_WAKEUP_EXT1:
      return "external RTC_CNTL";
    case ESP_SLEEP_WAKEUP_TOUCHPAD:
      return "touchpad";
    case ESP_SLEEP_WAKEUP_ULP:
      return "ULP";
    case ESP_SLEEP_WAKEUP_GPIO:
      return "GPIO";
    case ESP_SLEEP_WAKEUP_UART:
      return "UART";
    default:
      return "power-on/reset";
  }
}

void printWakeDiagnostics() {
  bootCount++;

  esp_sleep_wakeup_cause_t wakeCause = esp_sleep_get_wakeup_cause();

  Serial.println();
  Serial.println("==== Wake diagnostics ====");
  Serial.print("Boot count: ");
  Serial.println(bootCount);
  Serial.print("Wake cause: ");
  Serial.print(wakeCauseName(wakeCause));
  Serial.print(" (");
  Serial.print(static_cast<int>(wakeCause));
  Serial.println(")");
  Serial.print("Deep sleep interval: ");
  Serial.print(DEEP_SLEEP_INTERVAL_US / 1000000ULL);
  Serial.println(" seconds");
  Serial.print("Display time before sleep: ");
  Serial.print(DEEP_SLEEP_DISPLAY_TIME);
  Serial.println(" ms");
  Serial.println("==========================");
}

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
  unsigned long serialStart = millis();
  while (!Serial && millis() - serialStart < SERIAL_DEBUG_WAIT_MS) {
    delay(10);
  }
  delay(250);
  printWakeDiagnostics();

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
