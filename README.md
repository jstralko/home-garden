# Home Garden Monitoring Station

An ESP32-S3 based environmental monitoring station for tracking garden conditions, collecting long-term telemetry, and displaying live sensor data on an onboard TFT display.

## Features

* WiFi connectivity
* Adafruit IO cloud integration
* TFT dashboard
* Boot screen and status indicators
* Scrolling system marquee
* Battery monitoring
* Historical telemetry storage

## Hardware

### Controller

* Adafruit ESP32-S3 TFT Feather

### Sensors

#### BME688

Measures:

* Temperature
* Humidity
* Pressure
* Gas Resistance

I2C Address:

```text
0x77
```

#### VEML7700

Measures:

* Ambient Light
* Lux

I2C Address:

```text
0x10
```

#### MAX17048 Fuel Gauge

Built into the Feather.

Measures:

* Battery Voltage
* Battery Percentage

I2C Address:

```text
0x36
```

#### VH400 Soil Moisture Sensor

Measures:

* Soil Moisture Raw Value
* Soil Moisture Voltage

Connected to:

```text
A0
```

## Current Sensor Inventory

```text
0x10  VEML7700
0x36  MAX17048
0x77  BME688
```

## Project Structure

```text
home-garden/
├── home-garden.ino
├── secrets.h
│
├── display.h
├── display.cpp
│
├── sensors.h
├── sensors.cpp
│
├── telemetry.h
├── telemetry.cpp
│
└── README.md
```

## Display Features

### Status Bar

Displays system health:

```text
BME✓ LUX✓ SOIL✓ BAT✓ WF✓ IO✓
```

### Environmental Data

* Temperature (°F)
* Temperature (°C)
* Lux
* Soil Moisture
* Battery Status

### Marquee

Scrolling system status messages.

## Adafruit IO Feeds

Current feeds:

```text
temperature
humidity
pressure
gas
lux
soil_raw
soil_voltage
battery_voltage
battery_percent
```

Planned:

```text
soil_percent
system_voltage
system_current
system_power
```

## Secrets Management

Credentials are stored in:

```cpp
secrets.h
```

Example:

```cpp
#pragma once

#define WIFI_SSID "your-wifi"
#define WIFI_PASS "your-password"

#define IO_USERNAME "your-username"
#define IO_KEY "your-adafruit-io-key"
```

Do not commit this file.

Add to `.gitignore`:

```text
secrets.h
```

## Required Libraries

Install via Arduino Library Manager:

* Adafruit BME680 Library
* Adafruit VEML7700 Library
* Adafruit MAX1704X Library
* Adafruit IO Arduino
* Adafruit GFX Library
* Adafruit ST7735 and ST7789 Library

## Build Environment

* Arduino IDE 2.x
* ESP32 Board Package 3.x
* Fedora Linux

## Power

Current:

```text
USB Powered
```

Planned:

```text
LiPo Battery
INA260 Power Monitoring
Deep Sleep Support
Solar Charging
```

## Roadmap

### Near Term

* Soil moisture calibration
* Soil percentage feed
* Improved dashboard visuals

### Medium Term

* INA260 integration
* System voltage monitoring
* System current monitoring
* System power monitoring

### Long Term

* Battery mode
* Deep sleep
* Solar power
* React dashboard
* Garden Mission Control web interface

## License

Personal project for environmental monitoring and embedded systems experimentation.

