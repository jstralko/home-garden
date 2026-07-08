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

type LuxPoint = {
  value: number;
  updatedAt: string;
};

type LuxDayResponse = {
  points: LuxPoint[];
};

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

async function fetchLatestFeeds(): Promise<FeedState> {
  const response = await fetch("/api/feeds/latest");

  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(data?.error ?? `Feed refresh failed: ${response.status}`);
  }

  const data = await response.json() as LatestFeedsResponse;
  return data.feeds;
}

function todayRange(): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 1);

  return { start, end };
}

async function fetchLuxDay(): Promise<LuxPoint[]> {
  const { start, end } = todayRange();
  const params = new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString()
  });
  const response = await fetch(`/api/feeds/lux/day?${params.toString()}`);

  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(data?.error ?? `Lux history failed: ${response.status}`);
  }

  const data = await response.json() as LuxDayResponse;
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

function LuxDayChart({ points, error }: { points: LuxPoint[]; error: string | null }) {
  const { start, end } = useMemo(todayRange, []);
  const chart = useMemo(() => buildLuxChart(points, start, end), [points, start, end]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const activePoint = activeIndex === null ? null : chart.points[activeIndex] ?? null;

  return (
    <section className="lux-chart-section" aria-label="Today's lux history">
      <div className="chart-heading">
        <div>
          <div className="metric-label">Sunlight Today</div>
          <h2>Lux Through The Day</h2>
        </div>
        <div className="chart-stats">
          <span>Peak {formatLux(chart.peak)} lux</span>
          <span>Avg {formatLux(chart.average)} lux</span>
          <span>{chart.luxHours.toFixed(1)} klux-h</span>
        </div>
      </div>

      <div className="chart-frame">
        <svg className="lux-chart" viewBox="0 0 760 260" role="img" aria-label="Line chart of today's lux readings">
          <defs>
            <linearGradient id="lux-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#ffe34e" stopOpacity="0.42" />
              <stop offset="100%" stopColor="#ffe34e" stopOpacity="0.02" />
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
          {chart.areaPath && <path className="lux-area" d={chart.areaPath} />}
          {chart.linePath && <path className="lux-line" d={chart.linePath} />}
          {activePoint && (
            <g className="chart-tooltip-layer" pointerEvents="none">
              <line className="chart-crosshair" x1={activePoint.x} x2={activePoint.x} y1="22" y2="218" />
              <circle className="lux-active-dot" cx={activePoint.x} cy={activePoint.y} r="5" />
              <g transform={`translate(${tooltipX(activePoint.x)} ${tooltipY(activePoint.y)})`}>
                <rect className="chart-tooltip-box" width="124" height="52" rx="6" />
                <text className="chart-tooltip-value" x="10" y="21">{formatLux(activePoint.value)} lux</text>
                <text className="chart-tooltip-time" x="10" y="39">{activePoint.label}</text>
              </g>
            </g>
          )}
          {chart.points.map((point, index) => (
            <circle
              key={`hit-${point.x}-${point.y}`}
              className="lux-hit-target"
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
            <text className="chart-empty" x="380" y="132">{error ?? "No lux samples today"}</text>
          )}
        </svg>
      </div>
    </section>
  );
}

function buildLuxChart(points: LuxPoint[], start: Date, end: Date) {
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
    label: new Date(point.time).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit"
    })
  }));
  const linePath = smoothPath(chartPoints);
  const areaPath = chartPoints.length > 1
    ? `${linePath} L ${chartPoints[chartPoints.length - 1].x.toFixed(1)} ${top + chartHeight} L ${chartPoints[0].x.toFixed(1)} ${top + chartHeight} Z`
    : "";
  const average = sorted.length === 0 ? null : sorted.reduce((sum, point) => sum + point.value, 0) / sorted.length;

  let luxHours = 0;
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const hours = (current.time - previous.time) / (1000 * 60 * 60);
    if (hours > 0 && hours < 3) {
      luxHours += ((previous.value + current.value) / 2) * hours / 1000;
    }
  }

  const yTicks = [0, maxY / 2, maxY].map((value) => ({
    label: formatLux(value),
    y: top + (1 - value / maxY) * chartHeight
  }));
  const xTicks = [6, 12, 18].map((hour) => {
    const tick = new Date(start);
    tick.setHours(hour, 0, 0, 0);
    return {
      label: tick.toLocaleTimeString([], { hour: "numeric" }),
      x: left + ((tick.getTime() - startMs) / (endMs - startMs)) * chartWidth
    };
  });

  return {
    areaPath,
    average,
    linePath,
    luxHours,
    peak,
    points: chartPoints,
    xTicks,
    yTicks
  };
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
  const [luxPoints, setLuxPoints] = useState<LuxPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [luxError, setLuxError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLuxError(null);

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
      const luxHistory = await fetchLuxDay();
      setLuxPoints(luxHistory);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "Lux history failed";
      setLuxError(message);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const lastSeen = useMemo(() => {
    const latest = newestTimestamp(feeds);
    return latest ? new Date(latest).toLocaleString() : "No feed data";
  }, [feeds]);

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

      <LuxDayChart points={luxPoints} error={luxError} />

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
