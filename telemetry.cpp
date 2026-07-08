#include "telemetry.h"
#include "secrets.h"
#include "sensors.h"
#include "display.h"
#include "config.h"

#include <WiFi.h>
#include <AdafruitIO_WiFi.h>

AdafruitIO_WiFi io(IO_USERNAME, IO_KEY, WIFI_SSID, WIFI_PASS);

AdafruitIO_Feed *temperatureFeed    = io.feed("temperature");
AdafruitIO_Feed *batteryVoltageFeed = io.feed("battery-voltage");
AdafruitIO_Feed *batteryPercentFeed = io.feed("battery-percent");
AdafruitIO_Feed *humidityFeed       = io.feed("humidity");
AdafruitIO_Feed *pressureFeed       = io.feed("pressure");
AdafruitIO_Feed *gasFeed            = io.feed("gas");
AdafruitIO_Feed *luxFeed            = io.feed("lux");
AdafruitIO_Feed *soilRawFeed        = io.feed("soil-raw");
AdafruitIO_Feed *soilVoltageFeed    = io.feed("soil-voltage");
AdafruitIO_Feed *soilPercentFeed    = io.feed("soil-percent");

bool wifiConnected = false;
bool ioConnected = false;

static unsigned long lastUpload = 0;
static const unsigned long uploadInterval =
  LOW_POWER_MODE ? UPLOAD_INTERVAL_LOW_POWER : UPLOAD_INTERVAL_NORMAL;

const char* wifiStatusName(wl_status_t status) {
  switch (status) {
    case WL_CONNECTED:
      return "connected";
    case WL_NO_SSID_AVAIL:
      return "SSID unavailable";
    case WL_CONNECT_FAILED:
      return "connect failed";
    case WL_CONNECTION_LOST:
      return "connection lost";
    case WL_DISCONNECTED:
      return "disconnected";
    case WL_IDLE_STATUS:
      return "idle";
    default:
      return "unknown";
  }
}

void printWifiDiagnostics() {
  wl_status_t status = WiFi.status();
  Serial.print("WiFi status: ");
  Serial.print(wifiStatusName(status));
  Serial.print(" (");
  Serial.print(static_cast<int>(status));
  Serial.println(")");

  if (status == WL_CONNECTED) {
    Serial.print("WiFi RSSI: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
    Serial.print("WiFi IP: ");
    Serial.println(WiFi.localIP());
  }
}

bool initTelemetry() {
  Serial.print("Connecting to Adafruit IO");

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  io.connect();

  int frame = 0;
  unsigned long start = millis();
  unsigned long lastStatusPrint = 0;
  const unsigned long timeout =
    DEEP_SLEEP_MODE ? TELEMETRY_CONNECT_TIMEOUT_DEEP_SLEEP : TELEMETRY_CONNECT_TIMEOUT_NORMAL;

  while (io.status() < AIO_CONNECTED && millis() - start < timeout) {
    io.run();
    Serial.print(".");
    drawWaitStatus("Connecting", frame++);

    if (millis() - lastStatusPrint >= 3000) {
      lastStatusPrint = millis();
      Serial.println();
      printWifiDiagnostics();
      Serial.print("Adafruit IO status: ");
      Serial.println(io.statusText());
      Serial.print("Connecting to Adafruit IO");
    }

    delay(150);
  }

  wifiConnected = WiFi.status() == WL_CONNECTED;
  ioConnected = io.status() >= AIO_CONNECTED;

  if (ioConnected) {
    drawWaitStatus("Adafruit IO connected", frame++);
    Serial.println("\nAdafruit IO connected");
    printWifiDiagnostics();
  } else {
    drawWaitStatus("Adafruit IO timeout", frame++);
    Serial.println("\nAdafruit IO timeout");
    printWifiDiagnostics();
    Serial.print("Adafruit IO status: ");
    Serial.println(io.statusText());
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
    Serial.println("Telemetry upload skipped: Adafruit IO not connected");
    printWifiDiagnostics();
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
  uploaded &= soilPercentFeed->save(soilPercent);

  unsigned long flushStart = millis();
  while (millis() - flushStart < TELEMETRY_PUBLISH_FLUSH_MS) {
    io.run();
    delay(25);
  }

  Serial.println(uploaded ? "Uploaded feeds to Adafruit IO" : "Telemetry upload failed");
  return uploaded;
}

void shutdownTelemetry() {
  io.wifi_disconnect();
  WiFi.mode(WIFI_OFF);
  wifiConnected = false;
  ioConnected = false;
}
