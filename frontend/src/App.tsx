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

export default function App() {
  const [feeds, setFeeds] = useState<FeedState>(buildInitialFeeds);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const results = await fetchLatestFeeds();
      setFeeds((current) => ({
        ...current,
        ...results
      }));
      setLastRefresh(new Date().toISOString());
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Feed refresh failed");
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
