import { useState, useEffect, useCallback } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import {
  Search,
  Filter,
  Star,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  AlertCircle,
  Timer,
} from "lucide-react";
import { MiniSparkline } from "../shared/MiniSparkline";
import { DashboardContextType } from "../layouts/Layout";
import { API_BASE_URL } from "../../config";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssetDefinition {
  ticker: string;
  class: "BLUE_CHIP" | "VOLATILE" | "STABLE" | string;
  start_price: number;
  status: string;
}

interface ApiMarketData {
  symbol: string;
  price: number;
  change_24h: number;
  volume_24h: number;
  sparkline: number[];
}

interface MarketAsset {
  symbol: string;
  name: string;
  price: string;
  change: string;
  isPositive: boolean;
  high: string;
  low: string;
  volume: string;
  icon: string;
  iconColor: string;
  sparkline: number[];
}

// ─── Asset Class → Display Metadata ──────────────────────────────────────────
// Controls how each asset *class* is styled. Extend as new classes are added.

const CLASS_META: Record<string, { iconColor: string }> = {
  BLUE_CHIP: { iconColor: "bg-blue-500" },
  VOLATILE: { iconColor: "bg-orange-500" },
  STABLE: { iconColor: "bg-green-500" },
  // fallback handled below
};

const getClassMeta = (assetClass: string) =>
  CLASS_META[assetClass] ?? { iconColor: "bg-main" };

/** Derive a human-readable name from ticker (e.g. "TECH" → "Tech Index"). */
const tickerToName = (ticker: string): string =>
  ticker.charAt(0).toUpperCase() + ticker.slice(1).toLowerCase() + " Index";

/** Derive a single-char icon from ticker. */
const tickerToIcon = (ticker: string): string => ticker.charAt(0).toUpperCase();

// ─── Polling Intervals ────────────────────────────────────────────────────────

const POLL_OPTIONS = [
  { label: "5s", value: 5_000 },
  { label: "10s", value: 10_000 },
  { label: "30s", value: 30_000 },
  { label: "1m", value: 60_000 },
  { label: "Off", value: 0 },
] as const;

type PollInterval = (typeof POLL_OPTIONS)[number]["value"];

const DEFAULT_POLL_INTERVAL: PollInterval = 10_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatPrice = (price: number): string =>
  price >= 1_000
    ? `₹${price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `₹${price.toFixed(4)}`;

const formatChange = (change: number): string =>
  `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;

const formatVolume = (volume: number): string => {
  if (volume >= 1_000_000) return `₹${(volume / 1_000_000).toFixed(2)}M`;
  if (volume >= 1_000) return `₹${(volume / 1_000).toFixed(2)}K`;
  return `₹${volume.toFixed(2)}`;
};

const deriveHighLow = (sparkline: number[], price: number) => {
  if (!sparkline?.length) {
    return {
      high: formatPrice(price * 1.005),
      low: formatPrice(price * 0.995),
    };
  }
  return {
    high: formatPrice(Math.max(...sparkline)),
    low: formatPrice(Math.min(...sparkline)),
  };
};

const mapApiToAsset = (
  raw: ApiMarketData,
  def: AssetDefinition,
): MarketAsset => {
  const { iconColor } = getClassMeta(def.class);
  const { high, low } = deriveHighLow(raw.sparkline, raw.price);
  return {
    symbol: raw.symbol,
    name: tickerToName(raw.symbol),
    icon: tickerToIcon(raw.symbol),
    iconColor,
    price: formatPrice(raw.price),
    change: formatChange(raw.change_24h),
    isPositive: raw.change_24h >= 0,
    high,
    low,
    volume: formatVolume(raw.volume_24h),
    sparkline: raw.sparkline ?? [],
  };
};

// ─── Skeleton Row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="animate-pulse border-b border-subtle">
      <td className="py-3 px-3">
        <div className="h-3 w-4 bg-main/20 rounded" />
      </td>
      <td className="py-3 px-2">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-main/20" />
          <div className="h-3 w-20 bg-main/20 rounded" />
        </div>
      </td>
      <td className="py-3 px-2 text-right">
        <div className="h-3 w-16 bg-main/20 rounded ml-auto" />
      </td>
      <td className="py-3 px-2 text-right">
        <div className="h-3 w-12 bg-main/20 rounded ml-auto" />
      </td>
      <td className="py-3 px-2 text-right hidden sm:table-cell">
        <div className="h-3 w-14 bg-main/20 rounded ml-auto" />
      </td>
      <td className="py-3 px-2 text-right hidden md:table-cell">
        <div className="h-3 w-14 bg-main/20 rounded ml-auto" />
      </td>
      <td className="py-3 px-3" />
    </tr>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MarketsPage() {
  const { setActiveSymbol, watchlist, toggleWatchlist } =
    useOutletContext<DashboardContextType>();
  const navigate = useNavigate();

  // Asset definitions fetched once from /v1/assets
  const [assetDefs, setAssetDefs] = useState<AssetDefinition[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [assetsError, setAssetsError] = useState<string | null>(null);

  const [markets, setMarkets] = useState<MarketAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [pollInterval, setPollInterval] = useState<PollInterval>(
    DEFAULT_POLL_INTERVAL,
  );
  const [countdown, setCountdown] = useState<number>(
    DEFAULT_POLL_INTERVAL / 1000,
  );

  const [filter, setFilter] = useState<"all" | "gainers" | "losers">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // ── Step 1: Fetch asset definitions ───────────────────────────────────────

  useEffect(() => {
    const fetchAssets = async () => {
      setAssetsLoading(true);
      setAssetsError(null);
      try {
        const res = await fetch(`${API_BASE_URL}/assets`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.status !== "OK")
          throw new Error(json.message ?? "Failed to fetch assets");

        const active = (json.data as AssetDefinition[]).filter(
          (a) => a.status === "active",
        );
        if (active.length === 0)
          throw new Error("No active assets returned from server.");
        setAssetDefs(active);
      } catch (err) {
        setAssetsError(
          err instanceof Error ? err.message : "Failed to load asset list.",
        );
      } finally {
        setAssetsLoading(false);
      }
    };

    fetchAssets();
  }, []);

  // ── Step 2: Fetch market data for each symbol ──────────────────────────────
  // Only runs after assetDefs are loaded.

  const fetchMarkets = useCallback(async () => {
    if (assetDefs.length === 0) return;
    setError(null);

    try {
      const defMap = Object.fromEntries(assetDefs.map((d) => [d.ticker, d]));

      const results = await Promise.allSettled(
        assetDefs.map(async (def) => {
          const res = await fetch(`${API_BASE_URL}/marketdata/${def.ticker}`);
          if (!res.ok) throw new Error(`${def.ticker}: HTTP ${res.status}`);
          const json = await res.json();
          if (json.status !== "OK")
            throw new Error(`${def.ticker}: ${json.message}`);
          return mapApiToAsset(json.data as ApiMarketData, defMap[def.ticker]);
        }),
      );

      const successful = results
        .filter(
          (r): r is PromiseFulfilledResult<MarketAsset> =>
            r.status === "fulfilled",
        )
        .map((r) => r.value);

      const failed = results
        .filter((r): r is PromiseRejectedResult => r.status === "rejected")
        .map((r) => r.reason?.message ?? "Unknown error");

      if (successful.length === 0) {
        setError("Failed to load market data. " + failed.join("; "));
      } else {
        setMarkets(successful);
        setLastUpdated(new Date());
        if (failed.length > 0) {
          console.warn("[MarketsPage] Partial fetch failures:", failed);
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unexpected error fetching market data.",
      );
    } finally {
      setLoading(false);
    }
  }, [assetDefs]);

  // Trigger initial market fetch once assets are ready
  useEffect(() => {
    if (assetDefs.length === 0) return;
    setLoading(true);
    fetchMarkets();
  }, [assetDefs, fetchMarkets]);

  // Polling with countdown
  useEffect(() => {
    if (assetDefs.length === 0 || pollInterval === 0) {
      setCountdown(0);
      return;
    }

    setCountdown(pollInterval / 1000);

    const tick = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? pollInterval / 1000 : prev - 1));
    }, 1_000);

    const poll = setInterval(() => {
      fetchMarkets();
      setCountdown(pollInterval / 1000);
    }, pollInterval);

    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [pollInterval, fetchMarkets, assetDefs]);

  // ── Derived Data ───────────────────────────────────────────────────────────

  const filteredData = markets.filter((a) => {
    if (
      searchQuery &&
      !a.symbol.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !a.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
      return false;

    const changeVal = parseFloat(a.change);
    if (filter === "gainers") return changeVal > 0;
    if (filter === "losers") return changeVal < 0;
    return true;
  });

  const sortedByGain = [...markets].sort(
    (a, b) => parseFloat(b.change) - parseFloat(a.change),
  );

  const topCards = [
    sortedByGain[0] && { title: "Top Gainer", ...sortedByGain[0] },
    sortedByGain[sortedByGain.length - 1] && {
      title: "Top Loser",
      ...sortedByGain[sortedByGain.length - 1],
    },
    markets[Math.floor(markets.length / 2)] && {
      title: "Trending",
      ...markets[Math.floor(markets.length / 2)],
    },
    markets[0] && { title: "Most Active", ...markets[0] },
  ].filter(Boolean) as (MarketAsset & { title: string })[];

  // Combined loading state for first paint
  const isFirstLoad = assetsLoading || (loading && markets.length === 0);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleTradeClick = (symbol: string) => {
    setActiveSymbol(symbol);
    navigate("/app/trade");
  };

  const handleManualRefresh = () => {
    setLoading(true);
    fetchMarkets();
    setCountdown(pollInterval / 1000);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  // Asset-level error (can't even build the symbol list)
  if (assetsError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-down">
        <AlertCircle size={32} />
        <p className="text-sm font-semibold">{assetsError}</p>
        <button
          onClick={() => window.location.reload()}
          className="text-xs underline hover:no-underline text-muted"
        >
          Reload page
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full gap-0 overflow-hidden select-none font-sans">
      {/* ── Top Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0 shrink-0 pb-1">
        {isFirstLoad
          ? Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className={idx === 0 ? "" : "pl-1"}>
                <div className="glass-panel rounded-lg p-3 h-full animate-pulse">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-main/20" />
                      <div className="space-y-1">
                        <div className="h-3 w-16 bg-main/20 rounded" />
                        <div className="h-2 w-12 bg-main/20 rounded" />
                      </div>
                    </div>
                    <div className="h-3 w-10 bg-main/20 rounded" />
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div className="h-4 w-20 bg-main/20 rounded" />
                    <div className="h-7 w-20 bg-main/20 rounded" />
                  </div>
                </div>
              </div>
            ))
          : topCards.map((asset, idx) => (
              <div key={idx} className={idx === 0 ? "" : "pl-1"}>
                <div
                  className="glass-panel rounded-lg p-3 h-full cursor-pointer hover:bg-panel/50 transition-colors"
                  onClick={() => handleTradeClick(asset.symbol)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${asset.iconColor}`}
                      >
                        {asset.icon}
                      </div>
                      <div>
                        <div className="font-bold text-main text-sm">
                          {asset.symbol}
                        </div>
                        <div className="text-[10px] text-muted">
                          {asset.title}
                        </div>
                      </div>
                    </div>
                    <div
                      className={`flex items-center gap-1 text-sm font-bold ${asset.isPositive ? "text-up" : "text-down"}`}
                    >
                      {asset.isPositive ? (
                        <TrendingUp size={12} />
                      ) : (
                        <TrendingDown size={12} />
                      )}
                      {asset.change}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-lg font-bold font-mono text-main">
                      {asset.price}
                    </span>
                    <MiniSparkline
                      data={asset.sparkline}
                      width={80}
                      height={28}
                    />
                  </div>
                </div>
              </div>
            ))}
      </div>

      {/* ── Table Panel ───────────────────────────────────────────────────── */}
      <div className="flex-1 pt-1">
        <div className="glass-panel rounded-lg flex flex-col overflow-hidden h-full">
          {/* Table Header Controls */}
          <div className="px-3 py-2 border-b border-main flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">Markets Overview</span>
              {lastUpdated && !loading && (
                <span className="text-[10px] text-muted">
                  Updated {lastUpdated.toLocaleTimeString()}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {/* Polling interval selector */}
              <div className="flex items-center gap-1 bg-main/30 border border-main rounded px-1.5 py-1">
                <Timer size={10} className="text-muted shrink-0" />
                {POLL_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setPollInterval(opt.value as PollInterval)}
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-all ${
                      pollInterval === opt.value
                        ? "bg-panel border border-white/20 text-main"
                        : "text-muted hover:text-main"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Countdown + manual refresh */}
              <button
                onClick={handleManualRefresh}
                disabled={loading || assetsLoading}
                className="relative flex items-center justify-center w-6 h-6 text-muted hover:text-main transition-colors disabled:opacity-40 shrink-0"
                title="Refresh now"
              >
                {pollInterval > 0 && !loading && (
                  <svg
                    className="absolute inset-0 w-6 h-6 -rotate-90"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeOpacity="0.15"
                    />
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeDasharray={`${2 * Math.PI * 10}`}
                      strokeDashoffset={`${2 * Math.PI * 10 * (1 - countdown / (pollInterval / 1000))}`}
                      strokeLinecap="round"
                      className="transition-all duration-1000 ease-linear"
                      style={{ stroke: "var(--color-up, #22c55e)" }}
                    />
                  </svg>
                )}
                <RefreshCw
                  size={11}
                  className={loading ? "animate-spin" : ""}
                />
              </button>

              {/* Search */}
              <div className="flex items-center bg-main/50 rounded px-2 py-1 border border-main gap-1.5 flex-1 sm:flex-none focus-within:border-white/50 transition-colors">
                <Search size={12} className="text-muted" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent text-main text-xs outline-none w-full sm:w-16 placeholder:text-muted"
                />
              </div>

              {/* Gainers / Losers filter */}
              <div className="flex gap-1">
                {(["all", "gainers", "losers"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`text-xs uppercase font-bold px-2 py-1 rounded transition-all ${
                      filter === f
                        ? "bg-panel border border-white/20 text-main"
                        : "text-muted hover:text-main hover:bg-panel"
                    }`}
                  >
                    {f === "all" ? <Filter size={10} /> : f}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-down/10 border-b border-down/30 text-down text-xs">
              <AlertCircle size={12} />
              <span>{error}</span>
              <button
                onClick={handleManualRefresh}
                className="ml-auto underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          )}

          {/* Table */}
          <div className="flex-1 overflow-auto no-scrollbar">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-panel z-10">
                <tr className="text-muted border-b border-subtle text-[10px] uppercase tracking-wider">
                  <th className="pb-2 pt-2 px-3 font-medium">#</th>
                  <th className="pb-2 pt-2 px-2 font-medium">Asset</th>
                  <th className="pb-2 pt-2 px-2 font-medium text-right">
                    Price
                  </th>
                  <th className="pb-2 pt-2 px-2 font-medium text-right">24h</th>
                  <th className="pb-2 pt-2 px-2 font-medium text-right hidden sm:table-cell">
                    High
                  </th>
                  <th className="pb-2 pt-2 px-2 font-medium text-right hidden md:table-cell">
                    Low
                  </th>
                  <th className="pb-2 pt-2 px-3 font-medium text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {isFirstLoad ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <SkeletonRow key={i} />
                  ))
                ) : filteredData.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-12 text-center text-muted text-sm"
                    >
                      No assets match your search.
                    </td>
                  </tr>
                ) : (
                  filteredData.map((asset, i) => {
                    const isWatched = watchlist.includes(asset.symbol);
                    return (
                      <tr
                        key={asset.symbol}
                        className="group hover:bg-main/30 transition-colors"
                      >
                        <td className="py-2 px-3 text-muted text-sm">
                          {i + 1}
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white ${asset.iconColor}`}
                            >
                              {asset.icon}
                            </div>
                            <div>
                              <span className="font-semibold text-main text-sm">
                                {asset.symbol}
                              </span>
                              <span className="text-muted text-[10px] ml-1 hidden sm:inline">
                                {asset.name}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-2 px-2 font-mono text-right text-main font-semibold text-sm">
                          {asset.price}
                        </td>
                        <td
                          className={`py-2 px-2 font-mono text-right font-bold text-sm ${asset.isPositive ? "text-up" : "text-down"}`}
                        >
                          {asset.change}
                        </td>
                        <td className="py-2 px-2 font-mono text-right text-muted hidden sm:table-cell text-sm">
                          {asset.high}
                        </td>
                        <td className="py-2 px-2 font-mono text-right text-muted hidden md:table-cell text-sm">
                          {asset.low}
                        </td>
                        <td className="py-2 px-3 text-right w-32">
                          <div className="flex justify-end items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            
                            <button
                              onClick={() => handleTradeClick(asset.symbol)}
                              className="text-[10px] bg-up px-2 py-0.5 rounded hover:brightness-110 transition-colors text-white font-bold"
                            >
                              Trade
                            </button>
                            <button
                              onClick={() => toggleWatchlist(asset.symbol)}
                              className={`p-0.5 transition-colors ${isWatched ? "text-yellow-400" : "text-muted hover:text-yellow-400"}`}
                              title={
                                isWatched
                                  ? "Remove from Watchlist"
                                  : "Add to Watchlist"
                              }
                            >
                              <Star
                                size={14}
                                fill={isWatched ? "currentColor" : "none"}
                              />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
