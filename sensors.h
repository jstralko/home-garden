#pragma once

#include <Arduino.h>

extern float currentTempC;
extern float currentTempF;
extern float humidity;
extern float pressure;
extern float gas;

extern float lux;

extern int soilRaw;
extern float soilVoltage;

extern float batteryVoltage;
extern float batteryPercent;

extern bool fuelGaugeFound;
extern bool bmeFound;
extern bool vemlFound;
extern bool soilFound;

void initSensors();
void readSensors();