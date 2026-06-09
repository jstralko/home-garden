#include "sensors.h"

#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME680.h>
#include "Adafruit_MAX1704X.h"
#include <Adafruit_VEML7700.h>

Adafruit_BME680 bme;
Adafruit_MAX17048 maxlipo;
Adafruit_VEML7700 veml = Adafruit_VEML7700();

float currentTempC = 0.0;
float currentTempF = 0.0;
float humidity = 0.0;
float pressure = 0.0;
float gas = 0.0;

float lux = 0.0;

//A0 - need to resolder 
const int SOIL_PIN = A1;

int soilRaw = 0;
float soilVoltage = 0.0;

float batteryVoltage = 0.0;
float batteryPercent = 0.0;

bool fuelGaugeFound = false;
bool bmeFound = false;
bool vemlFound = false;
bool soilFound = true;

void initSensors() {
  Wire.begin();

  fuelGaugeFound = maxlipo.begin();
  Serial.println(fuelGaugeFound ? "MAX17048 fuel gauge found" : "MAX17048 fuel gauge not found");

  vemlFound = veml.begin();
  Serial.println(vemlFound ? "VEML7700 found" : "VEML7700 not found");

  bmeFound = bme.begin(0x77);
  if (bmeFound) {
    Serial.println("BME688 found");

    bme.setTemperatureOversampling(BME680_OS_8X);
    bme.setHumidityOversampling(BME680_OS_2X);
    bme.setPressureOversampling(BME680_OS_4X);
    bme.setIIRFilterSize(BME680_FILTER_SIZE_3);
  } else {
    Serial.println("BME688 not found");
  }

  pinMode(SOIL_PIN, INPUT);
}

void readSensors() {
  if (bmeFound && bme.performReading()) {
    currentTempC = bme.temperature;
    currentTempF = currentTempC * 9.0 / 5.0 + 32.0;
    humidity = bme.humidity;
    pressure = bme.pressure / 100.0;
    gas = bme.gas_resistance / 1000.0;
 
    Serial.print("Temperature: ");
    Serial.print(currentTempF);
    Serial.println(" F");
  } else {
    Serial.println("BME688 read failed");
  }

  if (fuelGaugeFound) {
    batteryVoltage = maxlipo.cellVoltage();
    batteryPercent = maxlipo.cellPercent();
  }

  if (vemlFound) {
    lux = veml.readLux();
  }

  soilRaw = analogRead(SOIL_PIN);
  soilVoltage = (soilRaw / 4095.0) * 3.3;

  Serial.print("soilVoltage:");
  Serial.println(soilVoltage);

  updateSoilStatus();
}

void updateSoilStatus() {
  soilFound =
    (soilVoltage > 0.05) &&
    (soilVoltage < 3.25);

  soilFound = false;
}

void shutdownSensors() {
  if (vemlFound) {
    veml.enable(false);
  }

  if (fuelGaugeFound) {
    maxlipo.enableSleep(true);
    maxlipo.sleep(true);
  }

  Wire.end();
}
