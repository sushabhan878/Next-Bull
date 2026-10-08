import { useState, useEffect, useContext } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Download,
  Calendar,
  Filter,
  RefreshCw,
} from "lucide-react";
import { AuthContext } from "../../context/AuthContext";
import { API_BASE_URL } from "../../config";

interface TradeRecord {
  id: string;
  symbol: string;
  side: "Buy" | "Sell";
  price: number;
  quantity: number;
  total: number;
  pnl: number;
  date: string; // 'YYYY-MM-DD'
  time: string; // 'HH:MM'
}

interface RawTrade {
  ID: string;
  Symbol: string;
  Price: number;
  Quantity: number;
  MakerOrderID: string;
  TakerOrderID: string;
  MakerUserID: number;
  TakerUserID: number;
  ExecutedAt: string;
}

function normalizeTrade(raw: RawTrade, currentUserId: number): TradeRecord {
  const d = new Date(raw.ExecutedAt);

  // If the logged-in user is the maker they sold (provided liquidity),
  // if they're the taker they bought (consumed liquidity).
  // Falls back to 'Buy' for noise/system trades where TakerUserID is 0.
  const side: "Buy" | "Sell" =
    raw.MakerUserID === currentUserId ? "Sell" : "Buy";

  return {
    id: raw.ID,
    symbol: raw.Symbol,
    side,
    price: raw.Price,
    quantity: raw.Quantity,
    total: raw.Price * raw.Quantity,
    pnl: 0, // not yet exposed by backend
    date: d.toISOString().slice(0, 10), // 'YYYY-MM-DD'
    time: d.toTimeString().slice(0, 5), // 'HH:MM'
  };
}

export function HistoryPage() {
  const auth = useContext(AuthContext);

  const [tradeHistory, setTradeHistory] = useState<TradeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<"all" | "buys" | "sells">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchHistory = async () => {
    if (!auth?.accessToken || !auth?.user) {
      setError("Not authenticated.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/trades/history`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.accessToken}`,
        },
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => res.statusText);
        throw new Error(`${res.status}: ${msg}`);
      }

      // Shape: { status, message, data: { trades: RawTrade[] } }
      const json = await res.json();
      const rawTrades: RawTrade[] = json?.data?.trades ?? [];

      setTradeHistory(rawTrades.map((t) => normalizeTrade(t, auth.user!.id)));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch trade history.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (auth?.loading) return;
    fetchHistory();
  }, [auth?.loading, auth?.accessToken]);

  // ── Client-side filtering ────────────────────────────────────────────────
  const filteredTrades = tradeHistory.filter((t) => {
    const formattedDate = t.date.split("-").reverse().join("/");

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !t.symbol.toLowerCase().includes(q) &&
        !t.side.toLowerCase().includes(q)
      )
        return false;
    }

    if (dateFilter) {
      const safeDateQuery = dateFilter.replace(/-/g, "/");
      if (!formattedDate.includes(safeDateQuery)) return false;
    }

    if (filter === "buys") return t.side === "Buy";
    if (filter === "sells") return t.side === "Sell";
    return true;
  });

  // ── CSV Export ───────────────────────────────────────────────────────────
  const handleExport = () => {
    const csv = ["Date,Symbol,Side,Price,Qty,Total,P&L"]
      .concat(
        filteredTrades.map(
          (t) =>
            `${t.date.split("-").reverse().join("/")},${t.symbol},${t.side},${t.price},${t.quantity},${t.total},${t.pnl}`,
        ),
      )
      .join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = "trade_history.csv";
    link.click();
  };

  const totalPnL = filteredTrades.reduce((sum, t) => sum + t.pnl, 0);
  const wins = filteredTrades.filter((t) => t.pnl > 0).length;
  const losses = filteredTrades.filter((t) => t.pnl < 0).length;

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col w-full h-full gap-0 overflow-hidden select-none font-sans">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 shrink-0 pb-[2px]">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={i === 0 ? "pr-0.5" : i === 1 ? "px-0.5" : "pl-0.5"}
            >
              <div className="glass-panel rounded-lg p-3 h-full animate-pulse">
                <div className="h-2 w-16 bg-white/10 rounded mb-2" />
                <div className="h-6 w-24 bg-white/10 rounded" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex-1 pt-1">
          <div className="glass-panel rounded-lg flex flex-col overflow-hidden h-full items-center justify-center gap-3">
            <RefreshCw size={20} className="text-muted animate-spin" />
            <span className="text-muted text-sm">Loading trade history…</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col w-full h-full items-center justify-center gap-3">
        <span className="text-down text-sm font-semibold">{error}</span>
        <button
          onClick={fetchHistory}
          className="flex items-center gap-1.5 text-xs font-bold uppercase px-3 py-1.5 rounded bg-panel border border-main hover:border-white/30 transition-colors"
        >
          <RefreshCw size={12} /> Retry
        </button>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col w-full h-full gap-0 overflow-hidden select-none font-sans">
      {/* Summary Cards */}
    
      {/* Table */}
      <div className="flex-1 pt-1">
        <div className="glass-panel rounded-lg flex flex-col overflow-hidden h-full">
          <div className="px-3 py-2 border-b border-main flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
            <span className="font-semibold text-sm">
              Trade History ({filteredTrades.length} trades)
            </span>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full md:w-auto">
              <div className="flex items-center bg-main/50 rounded px-2 py-1 border border-main gap-1.5 flex-1 sm:flex-none focus-within:border-white/50 transition-colors">
                <Search size={12} className="text-muted" />
                <input
                  type="text"
                  placeholder="Search asset..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent text-main text-sm outline-none w-full sm:w-24 placeholder:text-muted"
                />
              </div>

              <div className="flex items-center bg-main/50 rounded px-2 py-1 border border-main gap-1.5 flex-1 sm:flex-none focus-within:border-white/50 transition-colors">
                <Calendar size={12} className="text-muted" />
                <input
                  type="text"
                  placeholder="DD/MM/YYYY, MM/YYYY, or YYYY"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="bg-transparent text-main text-sm outline-none w-full sm:w-56 placeholder:text-muted/60"
                />
              </div>

              <div className="flex gap-1">
                {(["all", "buys", "sells"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`text-xs uppercase font-bold px-2 py-1 rounded transition-all ${
                      filter === f
                        ? "bg-panel border border-white/20 text-main"
                        : "text-muted hover:text-main hover:bg-panel"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>

              <button
                onClick={fetchHistory}
                className="flex items-center gap-1 bg-main/50 hover:bg-panel border border-main hover:border-white/30 transition-colors px-2 py-1 rounded text-sm font-bold text-main"
                title="Refresh"
              >
                <RefreshCw size={12} />
              </button>

              <button
                onClick={handleExport}
                className="flex items-center gap-1 bg-main/50 hover:bg-panel border border-main hover:border-white/30 transition-colors px-2 py-1 rounded text-sm font-bold text-main"
              >
                <Download size={12} /> CSV
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto no-scrollbar">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-panel z-10">
                <tr className="text-muted border-b border-subtle text-[10px] uppercase tracking-wider">
                  <th className="pb-2 pt-2 px-3 font-medium">Date</th>
                  <th className="pb-2 pt-2 px-2 font-medium">Symbol</th>
                  <th className="pb-2 pt-2 px-2 font-medium text-right">
                    Price
                  </th>
                  <th className="pb-2 pt-2 px-2 font-medium text-right hidden sm:table-cell">
                    Qty
                  </th>
                  <th className="pb-2 pt-2 px-2 font-medium text-right hidden md:table-cell">
                    Total
                  </th>
                  <th className="pb-2 pt-2 px-3 font-medium text-right">P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {filteredTrades.map((trade) => (
                  <tr
                    key={trade.id}
                    className="hover:bg-main/30 transition-colors group"
                  >
                    <td className="py-2 px-3 text-muted">
                      <div className="text-sm font-medium">
                        {trade.date.split("-").reverse().join("/")}
                      </div>
                      <div className="text-[10px] text-muted/70 font-mono">
                        {trade.time}
                      </div>
                    </td>
                    <td className="py-2 px-2 font-bold text-main text-sm">
                      {trade.symbol}
                    </td>
                    <td className="py-2 px-2 font-mono text-right text-main font-semibold text-sm">
                      ₹
                      {trade.price.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-2 px-2 font-mono text-right text-muted hidden sm:table-cell text-sm">
                      {trade.quantity}
                    </td>
                    <td className="py-2 px-2 font-mono text-right text-muted hidden md:table-cell text-sm">
                      ₹
                      {trade.total.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </td>
                    <td
                      className={`py-2 px-3 font-mono text-right font-bold text-sm ${trade.pnl >= 0 ? "text-up" : "text-down"}`}
                    >
                      {trade.pnl >= 0 ? "+" : ""}₹
                      {Math.abs(trade.pnl).toFixed(2)}
                    </td>
                  </tr>
                ))}
                {filteredTrades.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-8 text-center text-muted font-medium"
                    >
                      No trades found matching your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
