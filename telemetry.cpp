#include "telemetry.h"
#include "secrets.h"
#include "sensors.h"
#include "display.h"

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
static const unsigned long uploadInterval = 30000; // 30 seconds

void initTelemetry() {
  Serial.print("Connecting to Adafruit IO");

  io.connect();

  int frame = 0;
  unsigned long start = millis();
  const unsigned long timeout = 20000; // 20 seconds

  while (io.status() < AIO_CONNECTED && millis() - start < timeout) {
    Serial.print(".");
    drawWaitStatus("Connecting to Adafruit IO", frame++);
    delay(250);
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

  temperatureFeed->save(currentTempF);
  humidityFeed->save(humidity);
  pressureFeed->save(pressure);
  gasFeed->save(gas);
  luxFeed->save(lux);

  if (fuelGaugeFound) {
    batteryVoltageFeed->save(batteryVoltage);
    batteryPercentFeed->save(batteryPercent);
  }

  soilRawFeed->save(soilRaw);
  soilVoltageFeed->save(soilVoltage);

  Serial.println("Uploaded feeds to Adafruit IO");
}