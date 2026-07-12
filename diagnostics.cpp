#include "diagnostics.h"

#include <Arduino.h>
#include <esp_sleep.h>

#include "config.h"

namespace {
RTC_DATA_ATTR unsigned long bootCount = 0;

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
}  // namespace

void initializeDiagnostics() {
  Serial.begin(115200);
  unsigned long serialStart = millis();
  while (!Serial && millis() - serialStart < SERIAL_DEBUG_WAIT_MS) {
    delay(10);
  }
  delay(250);
}

void logWakeDiagnostics() {
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

void logSleepStart() {
  Serial.print("Sleeping for ");
  Serial.print(DEEP_SLEEP_INTERVAL_US / 1000000ULL);
  Serial.println(" seconds");
}
