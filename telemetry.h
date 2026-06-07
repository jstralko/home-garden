#pragma once

#include <Arduino.h>

extern bool wifiConnected;
extern bool ioConnected;

void initTelemetry();
void runTelemetry();
void uploadTelemetryIfDue();