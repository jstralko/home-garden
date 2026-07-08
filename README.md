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

## React Dashboard

The `frontend/` app mirrors the onboard TFT dashboard. A Go backend reads the
Adafruit IO feeds so the browser does not receive the Adafruit IO key.

```bash
cd backend
cp .env.example .env
$EDITOR .env
set -a
. ./.env
set +a
go run .
```

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` to the Go backend on port `8080`. For a
production-style local run, build the frontend first and start the backend:

```bash
cd frontend
npm run build
cd ../backend
set -a
. ./.env
set +a
go run .
```

The dashboard polls Adafruit IO every 30 seconds and uses the latest feed timestamps for the status indicators.

## Adafruit IO Feeds

Current feeds:

```text
temperature
humidity
pressure
gas
lux
soil-raw
soil-voltage
soil-percent
battery-voltage
battery-percent
```

Adafruit IO feed keys use dashes for multi-word names. Local C++ and React
state identifiers may use underscores, but API endpoints and `io.feed(...)`
names should use the dash-separated feed keys above.

Planned:

```text
system-voltage
system-current
system-power
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
USB or LiPo battery
Timer-based deep sleep
WiFi disabled between telemetry uploads
TFT and supported sensors placed in sleep mode
```

Deep sleep is configured in `config.h`:

```cpp
#define DEEP_SLEEP_MODE true

const uint64_t DEEP_SLEEP_INTERVAL_US =
  5ULL * 60ULL * 1000000ULL;
```

Each wake reads the sensors, connects to Adafruit IO, uploads one sample,
disables WiFi, and returns to deep sleep.

The VH400 must be powered through a switched supply or suitable GPIO/load
switch to eliminate its current draw during deep sleep. Connecting it directly
to 3.3 V leaves it powered while the ESP32 sleeps.

Planned:

```text
INA260 Power Monitoring
Solar Charging
```

## Roadmap

### Near Term

* Improved dashboard visuals

### Medium Term

* INA260 integration
* System voltage monitoring
* System current monitoring
* System power monitoring

### Long Term

* Battery mode
* Solar power
* React dashboard
* Garden Mission Control web interface

## License

Personal project for environmental monitoring and embedded systems experimentation.
