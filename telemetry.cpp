#include "telemetry.h"
#include "secrets.h"
#include "sensors.h"
#include "display.h"
#include "config.h"

#include <WiFi.h>
#include <AdafruitIO_WiFi.h>

AdafruitIO_WiFi io(IO_USERNAME, IO_KEY, WIFI_SSID, WIFI_PASS);

AdafruitIO_Feed *temperatureFeed    = io.feed("temperature");
AdafruitIO_Feed *batteryVoltageFeed = io.feed("battery_voltage");
AdafruitIO_Feed *batteryPercentFeed = io.feed("battery_percent");
AdafruitIO_Feed *humidityFeed       = io.feed("humidity");
AdafruitIO_Feed *pressureFeed       = io.feed("pressure");
AdafruitIO_Feed *gasFeed            = io.feed("gas");
AdafruitIO_Feed *luxFeed            = io.feed("lux");
AdafruitIO_Feed *soilRawFeed        = io.feed("soil_raw");
AdafruitIO_Feed *soilVoltageFeed    = io.feed("soil_voltage");

bool wifiConnected = false;
bool ioConnected = false;

static unsigned long lastUpload = 0;
static const unsigned long uploadInterval =
  LOW_POWER_MODE ? UPLOAD_INTERVAL_LOW_POWER : UPLOAD_INTERVAL_NORMAL;

bool initTelemetry() {
  Serial.print("Connecting to Adafruit IO");

  io.connect();

  int frame = 0;
  unsigned long start = millis();
  const unsigned long timeout =
    DEEP_SLEEP_MODE ? TELEMETRY_CONNECT_TIMEOUT_DEEP_SLEEP : TELEMETRY_CONNECT_TIMEOUT_NORMAL;

  while (io.status() < AIO_CONNECTED && millis() - start < timeout) {
    Serial.print(".");
    drawWaitStatus("Connecting", frame++);
    delay(150);
  }

  wifiConnected = WiFi.status() == WL_CONNECTED;
  ioConnected = io.status() >= AIO_CONNECTED;

  if (ioConnected) {
    drawWaitStatus("Adafruit IO connected", frame++);
    Serial.println("\nAdafruit IO connected");
  } else {
    drawWaitStatus("Adafruit IO timeout", frame++);
    Serial.println("\nAdafruit IO timeout");
  }

  delay(800);
  return ioConnected;
}

void runTelemetry() {
  io.run();

  wifiConnected = WiFi.status() == WL_CONNECTED;
  ioConnected = io.status() >= AIO_CONNECTED;
}

void uploadTelemetryIfDue() {
  unsigned long now = millis();

  if (io.status() < AIO_CONNECTED) {
    return;
  }

  if (now - lastUpload < uploadInterval) {
    return;
  }

  lastUpload = now;
  uploadTelemetryNow();
}

bool uploadTelemetryNow() {
  if (io.status() < AIO_CONNECTED) {
    return false;
  }

  bool uploaded = true;
  uploaded &= temperatureFeed->save(currentTempF);
  uploaded &= humidityFeed->save(humidity);
  uploaded &= pressureFeed->save(pressure);
  uploaded &= gasFeed->save(gas);
  uploaded &= luxFeed->save(lux);

  if (fuelGaugeFound) {
    uploaded &= batteryVoltageFeed->save(batteryVoltage);
    uploaded &= batteryPercentFeed->save(batteryPercent);
  }

  uploaded &= soilRawFeed->save(soilRaw);
  uploaded &= soilVoltageFeed->save(soilVoltage);

  Serial.println(uploaded ? "Uploaded feeds to Adafruit IO" : "Telemetry upload failed");
  return uploaded;
}

void shutdownTelemetry() {
  io.wifi_disconnect();
  WiFi.mode(WIFI_OFF);
  wifiConnected = false;
  ioConnected = false;
}
