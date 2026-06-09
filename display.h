#pragma once

#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>

// Global display object
extern Adafruit_ST7789 tft;

// Initialization
void initDisplay();

// Screens
void bootScreen();
void drawStaticDashboard();
void setDisplayPower(bool on);
void sleepDisplay();

// Widgets
void drawTemperature(float tempF, float tempC);
void drawBatteryInfo(float voltage, float percent);
void drawLux(float lux);
void drawStatusBar(
    bool bmeFound,
    bool vemlFound,
    bool soilFound,
    bool batteryFound,
    bool wifiConnected,
    bool ioConnected
);
void drawSoil(int raw, float voltage);

void drawMarquee();

void drawWaitStatus(const char* label, int frame);
