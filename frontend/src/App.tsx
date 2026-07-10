import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Battery, Cloud, Leaf, RefreshCw, Sun, Thermometer, Wifi } from "lucide-react";
import "./styles.css";

type FeedKey =
  | "temperature"
  | "humidity"
  | "pressure"
  | "gas"
  | "lux"
  | "soil_raw"
  | "soil_voltage"
  | "soil_percent"
  | "battery_voltage"
  | "battery_percent";

type FeedData = {
  value: number | null;
  updatedAt: string | null;
};

type FeedState = Record<FeedKey, FeedData>;

type LatestFeedsResponse = {
  feeds: FeedState;
};

type HistoryPoint = {
  value: number;
  updatedAt: string;
};

type DayHistoryResponse = {
  points: HistoryPoint[];
  mode: ChartMode;
};

type ChartMode = "12h" | "month";

type ChartPoint = {
  x: number;
  y: number;
  value: number;
  time: number;
  label: string;
};

const FEEDS: FeedKey[] = [
  "temperature",
  "humidity",
  "pressure",
  "gas",
  "lux",
  "soil_raw",
  "soil_voltage",
  "soil_percent",
  "battery_voltage",
  "battery_percent"
];

const EMPTY_FEED: FeedData = {
  value: null,
  updatedAt: null
};

const POLL_INTERVAL_MS = 30000;
const FRESH_MS = 3 * 60 * 1000;
const FEED_UPDATE_INTERVAL_MS = 15 * 60 * 1000;
const MARQUEE_TEXT = "  GARDEN NODE ONLINE  *  SUNLIGHT SENSOR ONLINE  *  PLANTS ARE BEING OBSERVED  *  ";

function buildInitialFeeds(): FeedState {
  return FEEDS.reduce((feeds, feed) => {
    feeds[feed] = EMPTY_FEED;
    return feeds;
  }, {} as FeedState);
}

function formatFixed(value: number | null, digits: number, fallback = "--"): string {
  return value === null ? fallback : value.toFixed(digits);
}

function formatLux(value: number | null): string {
  if (value === null) {
    return "--";
  }

  return value > 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(0);
}

function toCelsius(tempF: number | null): number | null {
  return tempF === null ? null : (tempF - 32) * 5 / 9;
}

function isFresh(updatedAt: string | null, now: number): boolean {
  if (!updatedAt) {
    return false;
  }

  return now - new Date(updatedAt).getTime() <= FRESH_MS;
}

function newestTimestamp(feeds: FeedState): string | null {
  return FEEDS
    .map((feed) => feeds[feed].updatedAt)
    .filter((date): date is string => Boolean(date))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
}

function formatCountdown(ms: number | null): string {
  if (ms === null) {
    return "--:--";
  }

  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

async function fetchLatestFeeds(): Promise<FeedState> {
  const response = await fetch("/api/feeds/latest");

  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(data?.error ?? `Feed refresh failed: ${response.status}`);
  }

  const data = await response.json() as LatestFeedsResponse;
  return data.feeds;
}

function historyRange(mode: ChartMode): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date(end);

  if (mode === "month") {
    start.setDate(end.getDate() - 30);
  } else {
    start.setHours(end.getHours() - 12);
  }

  return { start, end };
}

async function fetchDayHistory(endpoint: string, errorLabel: string, mode: ChartMode): Promise<HistoryPoint[]> {
  const { start, end } = historyRange(mode);
  const params = new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString(),
    mode
  });
  const response = await fetch(`${endpoint}?${params.toString()}`);

  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(data?.error ?? `${errorLabel} history failed: ${response.status}`);
  }

  const data = await response.json() as DayHistoryResponse;
  return data.points;
}

function StatusItem({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className="status-item">
      <span>{label}</span>
      <span className={ok ? "ok" : "bad"}>{ok ? "+" : "-"}</span>
    </span>
  );
}

function TftDashboard({
  feeds,
  loading,
  ioConnected,
  now
}: {
  feeds: FeedState;
  loading: boolean;
  ioConnected: boolean;
  now: number;
}) {
  const tempF = feeds.temperature.value;
  const tempC = toCelsius(tempF);
  const lux = feeds.lux.value;
  const soilRaw = feeds.soil_raw.value;
  const soilVoltage = feeds.soil_voltage.value;
  const soilPercent = feeds.soil_percent.value;
  const batteryVoltage = feeds.battery_voltage.value;
  const batteryPercent = feeds.battery_percent.value;

  const bmeFound =
    isFresh(feeds.temperature.updatedAt, now) ||
    isFresh(feeds.humidity.updatedAt, now) ||
    isFresh(feeds.pressure.updatedAt, now) ||
    isFresh(feeds.gas.updatedAt, now);
  const luxFound = isFresh(feeds.lux.updatedAt, now);
  const soilFound = isFresh(feeds.soil_voltage.updatedAt, now) && soilVoltage !== null && soilVoltage > 0.05 && soilVoltage < 3.25;
  const batteryFound = isFresh(feeds.battery_voltage.updatedAt, now) || isFresh(feeds.battery_percent.updatedAt, now);
  const wifiConnected = isFresh(newestTimestamp(feeds), now);

  return (
    <section className="tft-shell" aria-label="Garden node TFT dashboard">
      <div className="tft-screen">
        <div className="status-bar">
          <StatusItem label="BME" ok={bmeFound} />
          <StatusItem label="LUX" ok={luxFound} />
          <StatusItem label="SOIL" ok={soilFound} />
          <StatusItem label="BAT" ok={batteryFound} />
          <StatusItem label="WF" ok={wifiConnected} />
          <StatusItem label="IO" ok={ioConnected} />
        </div>
        <div className="divider" />
        <div className="temp-block">
          <div className="temp-label">TEMP</div>
          <div className="temp-value">{formatFixed(tempF, 1)}F</div>
          <div className="temp-c">{formatFixed(tempC, 1)}C</div>
        </div>
        <div className="battery-readout">
          <div>{formatFixed(batteryPercent, 0)}%</div>
          <div>{formatFixed(batteryVoltage, 2)}V</div>
        </div>
        <div className="lux-readout">Lux: {formatLux(lux)}</div>
        <div className={soilFound ? "soil-readout" : "soil-readout bad-soil"}>
          <div>Soil: {formatFixed(soilPercent, 0)}%</div>
          <div>{formatFixed(soilRaw, 0)} {formatFixed(soilVoltage, 2)}V</div>
        </div>
        <div className="marquee">
          <span>{loading ? "  REFRESHING FEEDS  *  " : MARQUEE_TEXT}</span>
        </div>
      </div>
    </section>
  );
}

function Metric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <article className="metric">
      <div className="metric-icon">{icon}</div>
      <div>
        <div className="metric-label">{label}</div>
        <div className="metric-value">{value}</div>
        <div className="metric-detail">{detail}</div>
      </div>
    </article>
  );
}

function DayLineChart({
  ariaLabel,
  averageLabel,
  emptyText,
  error,
  fillId,
  formatValue,
  heading,
  areaDivisor,
  mode,
  points,
  statLabel,
  strokeClass,
  subheading,
  unit
}: {
  ariaLabel: string;
  averageLabel: string;
  emptyText: string;
  error: string | null;
  fillId: string;
  formatValue: (value: number | null) => string;
  heading: string;
  areaDivisor: number;
  mode: ChartMode;
  points: HistoryPoint[];
  statLabel: string;
  strokeClass: string;
  subheading: string;
  unit: string;
}) {
  const { start, end } = useMemo(() => historyRange(mode), [mode]);
  const chart = useMemo(() => buildDayChart(points, start, end, mode, formatValue), [points, start, end, mode, formatValue]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const activePoint = activeIndex === null ? null : chart.points[activeIndex] ?? null;

  return (
    <section className="day-chart-section" aria-label={ariaLabel}>
      <div className="chart-heading">
        <div>
          <div className="metric-label">{subheading}</div>
          <h2>{heading}</h2>
        </div>
        <div className="chart-stats">
          <span>Peak {formatValue(chart.peak)}{unit}</span>
          <span>{averageLabel} {formatValue(chart.average)}{unit}</span>
          <span>{mode === "month" ? `${chart.points.length} days` : `${(chart.areaHours / areaDivisor).toFixed(1)} ${statLabel}`}</span>
        </div>
      </div>

      <div className="chart-frame">
        <svg className={`day-chart ${strokeClass}`} viewBox="0 0 760 260" role="img" aria-label={ariaLabel}>
          <defs>
            <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-color)" stopOpacity="0.42" />
              <stop offset="100%" stopColor="var(--chart-color)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <g className="chart-grid">
            {chart.yTicks.map((tick) => (
              <g key={tick.label}>
                <line x1="52" x2="734" y1={tick.y} y2={tick.y} />
                <text x="42" y={tick.y + 4}>{tick.label}</text>
              </g>
            ))}
          </g>
          <g className="chart-axis">
            {chart.xTicks.map((tick) => (
              <g key={tick.label}>
                <line x1={tick.x} x2={tick.x} y1="218" y2="224" />
                <text x={tick.x} y="244">{tick.label}</text>
              </g>
            ))}
          </g>
          {chart.areaPath && <path className={`chart-area ${strokeClass}`} d={chart.areaPath} style={{ fill: `url(#${fillId})` }} />}
          {chart.linePath && <path className={`chart-line ${strokeClass}`} d={chart.linePath} />}
          {activePoint && (
            <g className="chart-tooltip-layer" pointerEvents="none">
              <line className="chart-crosshair" x1={activePoint.x} x2={activePoint.x} y1="22" y2="218" />
              <circle className={`chart-active-dot ${strokeClass}`} cx={activePoint.x} cy={activePoint.y} r="5" />
              <g transform={`translate(${tooltipX(activePoint.x)} ${tooltipY(activePoint.y)})`}>
                <rect className="chart-tooltip-box" width="124" height="52" rx="6" />
                <text className="chart-tooltip-value" x="10" y="21">{formatValue(activePoint.value)}{unit}</text>
                <text className="chart-tooltip-time" x="10" y="39">{activePoint.label}</text>
              </g>
            </g>
          )}
          {chart.points.map((point, index) => (
            <circle
              key={`hit-${point.x}-${point.y}`}
              className="chart-hit-target"
              cx={point.x}
              cy={point.y}
              r="11"
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
              onFocus={() => setActiveIndex(index)}
              onBlur={() => setActiveIndex(null)}
              tabIndex={0}
            />
          ))}
          {!chart.linePath && (
            <text className="chart-empty" x="380" y="132">{error ?? emptyText}</text>
          )}
        </svg>
      </div>
    </section>
  );
}

function buildDayChart(points: HistoryPoint[], start: Date, end: Date, mode: ChartMode, formatValue: (value: number | null) => string) {
  const width = 760;
  const height = 260;
  const left = 52;
  const right = 26;
  const top = 22;
  const bottom = 42;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const startMs = start.getTime();
  const endMs = end.getTime();
  const sorted = points
    .map((point) => ({
      value: point.value,
      time: new Date(point.updatedAt).getTime()
    }))
    .filter((point) => Number.isFinite(point.value) && Number.isFinite(point.time))
    .sort((a, b) => a.time - b.time);
  const peak = sorted.reduce((max, point) => Math.max(max, point.value), 0);
  const maxY = Math.max(100, Math.ceil(peak / 100) * 100);
  const chartPoints: ChartPoint[] = sorted.map((point) => ({
    x: left + ((point.time - startMs) / (endMs - startMs)) * chartWidth,
    y: top + (1 - point.value / maxY) * chartHeight,
    value: point.value,
    time: point.time,
    label: formatPointLabel(point.time, mode)
  }));
  const linePath = smoothPath(chartPoints);
  const areaPath = chartPoints.length > 1
    ? `${linePath} L ${chartPoints[chartPoints.length - 1].x.toFixed(1)} ${top + chartHeight} L ${chartPoints[0].x.toFixed(1)} ${top + chartHeight} Z`
    : "";
  const average = sorted.length === 0 ? null : sorted.reduce((sum, point) => sum + point.value, 0) / sorted.length;

  let areaHours = 0;
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const hours = (current.time - previous.time) / (1000 * 60 * 60);
    if (hours > 0 && hours < 3) {
      areaHours += ((previous.value + current.value) / 2) * hours;
    }
  }

  const yTicks = [0, maxY / 2, maxY].map((value) => ({
    label: formatValue(value),
    y: top + (1 - value / maxY) * chartHeight
  }));
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((offset) => {
    const tick = new Date(start.getTime() + (endMs - startMs) * offset);
    return {
      label: formatTickLabel(tick, mode),
      x: left + ((tick.getTime() - startMs) / (endMs - startMs)) * chartWidth
    };
  });

  return {
    areaPath,
    average,
    linePath,
    areaHours,
    peak,
    points: chartPoints,
    xTicks,
    yTicks
  };
}

function formatPointLabel(time: number, mode: ChartMode): string {
  const date = new Date(time);
  if (mode === "month") {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatTickLabel(date: Date, mode: ChartMode): string {
  if (mode === "month") {
    return date.toLocaleDateString([], { month: "numeric", day: "numeric" });
  }

  return date.toLocaleTimeString([], { hour: "numeric" });
}

function smoothPath(points: ChartPoint[]): string {
  if (points.length === 0) {
    return "";
  }

  if (points.length === 1) {
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  }

  return points.reduce((path, point, index) => {
    if (index === 0) {
      return `M ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    }

    const previous = points[index - 1];
    const controlDistance = Math.max(4, (point.x - previous.x) * 0.42);
    const c1x = previous.x + controlDistance;
    const c2x = point.x - controlDistance;

    return `${path} C ${c1x.toFixed(1)} ${previous.y.toFixed(1)}, ${c2x.toFixed(1)} ${point.y.toFixed(1)}, ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }, "");
}

function tooltipX(x: number): number {
  if (x > 620) {
    return x - 132;
  }

  if (x < 120) {
    return x + 10;
  }

  return x - 62;
}

function tooltipY(y: number): number {
  return y < 86 ? y + 14 : y - 66;
}

export default function App() {
  const [feeds, setFeeds] = useState<FeedState>(buildInitialFeeds);
  const [luxPoints, setLuxPoints] = useState<HistoryPoint[]>([]);
  const [soilPoints, setSoilPoints] = useState<HistoryPoint[]>([]);
  const [temperaturePoints, setTemperaturePoints] = useState<HistoryPoint[]>([]);
  const [chartMode, setChartMode] = useState<ChartMode>("12h");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [luxError, setLuxError] = useState<string | null>(null);
  const [soilError, setSoilError] = useState<string | null>(null);
  const [temperatureError, setTemperatureError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLuxError(null);
    setSoilError(null);
    setTemperatureError(null);

    try {
      const results = await fetchLatestFeeds();
      setFeeds((current) => ({
        ...current,
        ...results
      }));
      setLastRefresh(new Date().toISOString());
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "Feed refresh failed";
      setError(message);
    }

    try {
      const luxHistory = await fetchDayHistory("/api/feeds/lux/day", "Lux", chartMode);
      setLuxPoints(luxHistory);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "Lux history failed";
      setLuxError(message);
    }

    try {
      const soilHistory = await fetchDayHistory("/api/feeds/soil-percent/day", "Soil moisture", chartMode);
      setSoilPoints(soilHistory);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "Soil moisture history failed";
      setSoilError(message);
    }

    try {
      const temperatureHistory = await fetchDayHistory("/api/feeds/temperature/day", "Temperature", chartMode);
      setTemperaturePoints(temperatureHistory);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "Temperature history failed";
      setTemperatureError(message);
    } finally {
      setLoading(false);
    }
  }, [chartMode]);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const tempC = toCelsius(feeds.temperature.value);
  const ioConnected = !error;
  const latestFeedTimestamp = useMemo(() => newestTimestamp(feeds), [feeds]);

  const lastSeen = useMemo(() => {
    return latestFeedTimestamp ? new Date(latestFeedTimestamp).toLocaleString() : "No feed data";
  }, [latestFeedTimestamp]);

  const nextFeedMs = latestFeedTimestamp
    ? new Date(latestFeedTimestamp).getTime() + FEED_UPDATE_INTERVAL_MS
    : null;
  const countdownMs = nextFeedMs === null ? null : nextFeedMs - now;
  const countdownDetail = nextFeedMs === null
    ? "Waiting for feed data"
    : `Expected around ${new Date(nextFeedMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;

  return (
    <main className="app">
      <div className="topbar">
        <div>
          <p className="eyebrow">GARDEN NODE</p>
          <h1>Environmental Hub</h1>
        </div>
        <div className="actions">
          <button className="icon-button" type="button" onClick={refresh} disabled={loading} title="Refresh feeds">
            <RefreshCw aria-hidden="true" className={loading ? "spin" : ""} size={19} />
          </button>
        </div>
      </div>

      <div className="dashboard-layout">
        <TftDashboard feeds={feeds} loading={loading} ioConnected={ioConnected} now={now} />

        <section className="metrics-grid" aria-label="Latest feed values">
          <Metric
            icon={<RefreshCw size={19} />}
            label="Next Wake"
            value={formatCountdown(countdownMs)}
            detail={countdownDetail}
          />
          <Metric
            icon={<Thermometer size={19} />}
            label="Temperature"
            value={`${formatFixed(feeds.temperature.value, 1)} F`}
            detail={`${formatFixed(tempC, 1)} C`}
          />
          <Metric
            icon={<Sun size={19} />}
            label="Light"
            value={`${formatLux(feeds.lux.value)} lux`}
            detail={`Humidity ${formatFixed(feeds.humidity.value, 1)}%`}
          />
          <Metric
            icon={<Leaf size={19} />}
            label="Soil"
            value={`${formatFixed(feeds.soil_percent.value, 0)}%`}
            detail={`${formatFixed(feeds.soil_voltage.value, 2)}V raw ${formatFixed(feeds.soil_raw.value, 0)}`}
          />
          <Metric
            icon={<Battery size={19} />}
            label="Battery"
            value={`${formatFixed(feeds.battery_percent.value, 0)}%`}
            detail={`${formatFixed(feeds.battery_voltage.value, 2)}V`}
          />
          <Metric
            icon={<Cloud size={19} />}
            label="Air"
            value={`${formatFixed(feeds.pressure.value, 1)} hPa`}
            detail={`Gas ${formatFixed(feeds.gas.value, 1)} KOhms`}
          />
          <Metric
            icon={<Wifi size={19} />}
            label="Telemetry"
            value={error ? "Error" : "Connected"}
            detail={error ?? `Last feed ${lastSeen}`}
          />
        </section>
      </div>

      <div className="charts-layout">
        <div className="chart-mode-row" aria-label="Chart range">
          <button className={chartMode === "12h" ? "mode-button active" : "mode-button"} type="button" onClick={() => setChartMode("12h")}>
            12h
          </button>
          <button className={chartMode === "month" ? "mode-button active" : "mode-button"} type="button" onClick={() => setChartMode("month")}>
            Month
          </button>
        </div>
        <DayLineChart
          ariaLabel={chartMode === "month" ? "Line chart of daily average lux readings for the last month" : "Line chart of lux readings for the last 12 hours"}
          averageLabel="Avg"
          emptyText={chartMode === "month" ? "No lux samples this month" : "No lux samples in the last 12 hours"}
          error={luxError}
          fillId="lux-fill"
          formatValue={formatLux}
          heading={chartMode === "month" ? "Daily Average Lux" : "Lux Last 12 Hours"}
          areaDivisor={1000}
          mode={chartMode}
          points={luxPoints}
          statLabel="klux-h"
          strokeClass="sun-chart"
          subheading={chartMode === "month" ? "Sunlight Month" : "Sunlight Window"}
          unit=" lux"
        />
        <DayLineChart
          ariaLabel={chartMode === "month" ? "Line chart of daily average soil moisture percentage readings for the last month" : "Line chart of soil moisture percentage readings for the last 12 hours"}
          averageLabel="Avg"
          emptyText={chartMode === "month" ? "No soil moisture samples this month" : "No soil moisture samples in the last 12 hours"}
          error={soilError}
          fillId="soil-fill"
          formatValue={(value) => formatFixed(value, 0)}
          heading={chartMode === "month" ? "Daily Average Soil Moisture" : "Soil Moisture Last 12 Hours"}
          areaDivisor={1}
          mode={chartMode}
          points={soilPoints}
          statLabel="%-h"
          strokeClass="soil-chart"
          subheading={chartMode === "month" ? "Soil Month" : "Soil Window"}
          unit="%"
        />
        <DayLineChart
          ariaLabel={chartMode === "month" ? "Line chart of daily average temperature readings for the last month" : "Line chart of temperature readings for the last 12 hours"}
          averageLabel="Avg"
          emptyText={chartMode === "month" ? "No temperature samples this month" : "No temperature samples in the last 12 hours"}
          error={temperatureError}
          fillId="temperature-fill"
          formatValue={(value) => formatFixed(value, 1)}
          heading={chartMode === "month" ? "Daily Average Temperature" : "Temperature Last 12 Hours"}
          areaDivisor={1}
          mode={chartMode}
          points={temperaturePoints}
          statLabel="F-h"
          strokeClass="temperature-chart"
          subheading={chartMode === "month" ? "Temperature Month" : "Temperature Window"}
          unit="F"
        />
      </div>

      <footer className="footer">
        <span>Last refresh: {lastRefresh ? new Date(lastRefresh).toLocaleTimeString() : "--"}</span>
        <span>Poll: {POLL_INTERVAL_MS / 1000}s</span>
      </footer>
    </main>
  );
}

const rootElement = document.getElementById("root");

if (rootElement) {
  createRoot(rootElement).render(<App />);
}
