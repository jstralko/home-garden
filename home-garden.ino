#include "secrets.h"
#include "display.h"
#include "sensors.h"
#include "telemetry.h"

unsigned long lastSensorRead = 0;
unsigned long lastMarqueeMove = 0;

const unsigned long sensorInterval = 3000;
const unsigned long marqueeInterval = 35;

void setup() {
  Serial.begin(115200);
  delay(1000);

  initDisplay();
  bootScreen();
  drawStaticDashboard();

  initSensors();
  initTelemetry();
}

void loop() {
  runTelemetry();

  unsigned long now = millis();

  if (now - lastSensorRead >= sensorInterval) {
    lastSensorRead = now;
    readSensors();

    drawTemperature(currentTempF, currentTempC);
    drawBatteryInfo(batteryVoltage, batteryPercent);
    drawLux(lux);
    drawSoil(soilRaw, soilVoltage);
    drawStatusBar(bmeFound, vemlFound, soilFound, fuelGaugeFound, wifiConnected, ioConnected);

    uploadTelemetryIfDue();
  }

  if (now - lastMarqueeMove >= marqueeInterval) {
    lastMarqueeMove = now;
    drawMarquee();
  }
}