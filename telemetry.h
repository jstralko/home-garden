#pragma once

#include <Arduino.h>

extern bool wifiConnected;
extern bool ioConnected;

bool initTelemetry();
void runTelemetry();
void uploadTelemetryIfDue();
bool uploadTelemetryNow();
void shutdownTelemetry();
