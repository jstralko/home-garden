#include "display.h"

#include "sensors.h"
#include "telemetry.h"
#include "config.h"

#include <SPI.h>

// Feather TFT definitions
Adafruit_ST7789 tft =
    Adafruit_ST7789(&SPI, TFT_CS, TFT_DC, TFT_RST);

static int marqueeX = 240;

static const char marqueeText[] =
"  GARDEN NODE ONLINE  *  SUNLIGHT SENSOR ONLINE  *  PLANTS ARE BEING OBSERVED  *  ";

void initDisplay() {

    pinMode(TFT_BACKLITE, OUTPUT);
    digitalWrite(TFT_BACKLITE, HIGH);

    tft.init(135, 240);
    tft.setRotation(3);
    tft.setTextWrap(false);
}

void bootScreen() {

    tft.fillScreen(ST77XX_BLACK);

    tft.setTextColor(ST77XX_GREEN);
    tft.setTextSize(2);

    tft.setCursor(38,20);
    tft.println("GARDEN NODE");

    tft.setTextColor(ST77XX_WHITE);
    tft.setTextSize(1);

    tft.setCursor(48,52);
    tft.println("Environmental Hub");

    if (DEEP_SLEEP_MODE) {
        tft.setTextColor(ST77XX_YELLOW);
        tft.setCursor(84,68);
        tft.println("DEEP SLEEP");
    } else if (LOW_POWER_MODE) {
        tft.setTextColor(ST77XX_YELLOW);
        tft.setCursor(90,68);
        tft.println("LOW POWER");
    }

    delay(1500);
}

void setDisplayPower(bool on) {
  digitalWrite(TFT_BACKLITE, on ? HIGH : LOW);
}

void sleepDisplay() {
  setDisplayPower(false);
  tft.enableDisplay(false);
  tft.enableSleep(true);
}

void drawStaticDashboard() {

    tft.fillScreen(ST77XX_BLACK);

    tft.drawFastHLine(
        0,
        18,
        240,
        ST77XX_WHITE
    );
}

void refreshDashboard() {
  drawTemperature(currentTempF, currentTempC);
  drawBatteryInfo(batteryVoltage, batteryPercent);
  drawLux(lux);
  drawSoil(soilRaw, soilVoltage, soilPercent);
  drawStatusBar(
      bmeFound,
      vemlFound,
      soilFound,
      fuelGaugeFound,
      wifiConnected,
      ioConnected);
}

void drawStatusBar(
    bool bmeFound,
    bool vemlFound,
    bool soilFound,
    bool batteryFound,
    bool wifiConnected,
    bool ioConnected
) {

    tft.fillRect(
        0,
        0,
        240,
        16,
        ST77XX_BLACK
    );

    tft.setTextSize(1);

    int x = 2;

    auto drawItem = [&](const char* label, bool ok) {

        tft.setCursor(x,4);

        tft.setTextColor(ST77XX_WHITE);
        tft.print(label);

        tft.setTextColor(
            ok ? ST77XX_GREEN : ST77XX_RED
        );

        tft.print(ok ? "+" : "-");

        x += 38;
    };

    drawItem("BME",  bmeFound);
    drawItem("LUX",  vemlFound);
    drawItem("SOIL", soilFound);
    drawItem("BAT",  batteryFound);
    drawItem("WF",   wifiConnected);
    drawItem("IO",   ioConnected);
}

void drawTemperature(
    float tempF,
    float tempC
) {

    tft.fillRect(
        0,
        24,
        240,
        70,
        ST77XX_BLACK
    );

    tft.setTextColor(ST77XX_WHITE);
    tft.setTextSize(2);

    tft.setCursor(24,28);
    tft.print("TEMP");

    tft.setTextColor(ST77XX_ORANGE);
    tft.setTextSize(4);

    tft.setCursor(24,52);
    tft.print(tempF,1);
    tft.print("F");

    tft.setTextColor(ST77XX_WHITE);
    tft.setTextSize(1);

    tft.setCursor(170,82);
    tft.print(tempC,1);
    tft.print("C");
}

void drawBatteryInfo(
    float voltage,
    float percent
) {

    tft.fillRect(
        150,
        20,
        90,
        25,
        ST77XX_BLACK
    );

    tft.setTextSize(1);
    tft.setTextColor(ST77XX_CYAN);

    tft.setCursor(150,24);
    tft.print(percent,0);
    tft.print("%");

    tft.setCursor(150,34);
    tft.print(voltage,2);
    tft.print("V");
}

void drawLux(float lux) {

    tft.fillRect(
        0,
        95,
        240,
        15,
        ST77XX_BLACK
    );

    tft.setTextColor(ST77XX_YELLOW);
    tft.setTextSize(1);

    tft.setCursor(5,95);

    tft.print("Lux: ");

    if (lux > 1000) {
        tft.print(lux / 1000.0, 1);
        tft.print("k");
    } else {
        tft.print(lux,0);
    }
}

void drawSoil(int raw, float voltage, float percent) {
  tft.fillRect(120, 95, 120, 21, ST77XX_BLACK);

  tft.setTextSize(1);
  tft.setTextColor(soilFound ? ST77XX_GREEN : ST77XX_RED);

  tft.setCursor(120, 95);
  tft.print("Soil: ");
  tft.print(percent, 0);
  tft.print("%");

  tft.setCursor(120, 106);
  tft.print(raw);
  tft.print(" ");
  tft.print(voltage, 2);
  tft.print("V");
}

void drawMarquee() {

    tft.fillRect(
        0,
        118,
        240,
        17,
        ST77XX_BLACK
    );

    tft.setTextColor(ST77XX_GREEN);
    tft.setTextSize(1);

    tft.setCursor(
        marqueeX,
        120
    );

    tft.print(marqueeText);

    marqueeX -= 2;

    const int width = (sizeof(marqueeText) - 1) * 6;

    if (marqueeX <= -width) {
        marqueeX = tft.width();
    }
}

void drawWaitStatus(const char* label, int frame) {
  const char spinner[] = "|/-\\";

  drawStaticDashboard();

  tft.setTextSize(1);
  tft.setTextColor(ST77XX_CYAN);

  tft.setCursor(60, 60);
  tft.print(spinner[frame % 4]);
  tft.print(" ");
  tft.print(label);
}
