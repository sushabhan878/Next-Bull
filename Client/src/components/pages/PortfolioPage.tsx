import React, { useState } from "react";
import {
  Activity,
  ChevronDown,
} from "lucide-react";
import { usePortfolio } from "../../hooks/usePortfolio";
import { AnimatedValue } from "../shared/AnimatedValue";
export function PortfolioPage() {
  const {
    holdings,
    cashBalance,
    totalPortfolioValue,
    totalUnrealizedPnL,
    totalPnLPercentage,
    wsStatus,
  } = usePortfolio();

  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"value" | "pnl" | "change">("value");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // NOTE: The fake price simulation useEffect has been REMOVED.
  // Prices now come exclusively from the WebSocket.

  const sortedHoldings = [...holdings].sort((a, b) => {
    let aVal = 0,
      bVal = 0;
    if (sortBy === "value") {
      aVal = a.value;
      bVal = b.value;
    } else if (sortBy === "pnl") {
      aVal = a.unrealizedPnL;
      bVal = b.unrealizedPnL;
    } else {
      aVal = a.change24hPercent;
      bVal = b.change24hPercent;
    }
    return sortDir === "desc" ? bVal - aVal : aVal - bVal;
  });

  const isPositivePnL = totalUnrealizedPnL >= 0;

  const wsStatusConfig = {
    connected: { color: "bg-green-500", label: "Live" },
    connecting: {
      color: "bg-yellow-500 animate-pulse",
      label: "Connecting...",
    },
    disconnected: { color: "bg-gray-500", label: "Disconnected" },
    error: { color: "bg-red-500", label: "Error" },
  };
  const currentWsStatus = wsStatusConfig[wsStatus];

  return (
    <div className="flex flex-col md:flex-row w-full h-full gap-0 overflow-hidden select-none font-sans">
      {/* Left Column */}
      <div className="w-full md:w-[280px] flex flex-col gap-0 shrink-0 pr-1">
        {/* WS Status Indicator */}
        <div className="pb-1">
          <div className="glass-panel rounded-lg px-3 py-1.5 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${currentWsStatus.color}`} />
            <span className="text-[10px] text-muted uppercase tracking-wider font-medium">
              {currentWsStatus.label}
            </span>
          </div>
        </div>

        {/* Total Portfolio Value */}
        <div className="pb-1">
          <div className="glass-panel rounded-lg p-3">
            <div className="text-[10px] text-muted uppercase tracking-wider font-medium mb-1">
              Total Portfolio Value
            </div>
            <div className="text-2xl font-bold text-main mb-1">
              <AnimatedValue
                value={totalPortfolioValue}
                prefix="₹"
                decimals={2}
                size="lg"
              />
            </div>
            <div className="text-xs text-muted">
              24h:{" "}
              <span className={isPositivePnL ? "text-up" : "text-down"}>
                {isPositivePnL ? "+" : ""}
                {totalPnLPercentage.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>

        {/* Unrealized P&L */}
        <div className="pb-1">
          <div
            className={`glass-panel rounded-lg p-3 border-l-2 ${isPositivePnL ? "border-l-[var(--trading-green)]" : "border-l-[var(--trading-red)]"}`}
          >
            <div className="text-[10px] text-muted uppercase tracking-wider font-medium mb-1">
              Unrealized P&L
            </div>
            <div
              className={`text-xl font-bold font-mono ${isPositivePnL ? "text-up" : "text-down"}`}
            >
              <AnimatedValue
                value={Math.abs(totalUnrealizedPnL)}
                prefix={isPositivePnL ? "+₹" : "-₹"}
                decimals={2}
                size="md"
              />
            </div>
          </div>
        </div>

        {/* Cash Balance */}
        <div className="pb-1">
          <div className="glass-panel rounded-lg p-3">
            <div className="text-[10px] text-muted uppercase tracking-wider font-medium mb-1">
              Balance
            </div>
            <div className="text-lg font-mono font-semibold text-main">
              <AnimatedValue value={cashBalance} prefix="₹" decimals={2} />
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="flex-1">
          <div className="glass-panel rounded-lg flex flex-col overflow-hidden h-full">
            <div className="px-3 py-2 border-b border-main">
              <span className="font-semibold text-sm">Recent Activity</span>
            </div>
            {/* <div className="p-2 space-y-1 overflow-y-auto no-scrollbar flex-1">
              {[
                { text: "Bought 0.452 BTC", time: "2h ago", color: "text-up" },
                { text: "Sold 15.0 SOL", time: "5h ago", color: "text-down" },
                { text: "Deposit ₹5,000", time: "1d ago", color: "text-main" },
                {
                  text: "Staked 1,200 ADA",
                  time: "2d ago",
                  color: "text-muted",
                },
              ].map((act, i) => (
                <div
                  key={i}
                  className="flex justify-between items-center p-2 text-sm hover:bg-main/30 rounded transition-colors"
                >
                  <span className={`font-semibold ${act.color}`}>
                    {act.text}
                  </span>
                  <span className="text-[10px] text-muted font-mono">
                    {act.time}
                  </span>
                </div>
              ))}
            </div> */}
          </div>
        </div>
      </div>

      {/* Right Content: Holdings Table */}
      <div className="flex-1 pl-1">
        <div className="glass-panel rounded-lg flex flex-col overflow-hidden h-full">
          <div className="px-3 py-2 border-b border-main font-semibold text-sm flex items-center justify-between">
            <span>Holdings ({holdings.length} assets)</span>
            <div className="flex gap-1">
              {(["value", "pnl"] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => {
                    if (sortBy === key)
                      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                    else {
                      setSortBy(key);
                      setSortDir("desc");
                    }
                  }}
                  className={`text-xs uppercase font-bold px-2 py-1 rounded transition-all ${
                    sortBy === key
                      ? "bg-panel border border-white/20 text-main"
                      : "text-muted hover:text-main hover:bg-panel"
                  }`}
                >
                  {key === "value" ? "Value" : "P&L"}{" "}
                  {sortBy === key && (sortDir === "desc" ? "↓" : "↑")}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-auto no-scrollbar">
            {holdings.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted gap-2">
                <Activity size={24} className="opacity-40" />
                <span className="text-sm">
                  {wsStatus === "connected"
                    ? "No holdings yet"
                    : "Waiting for data..."}
                </span>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-panel z-10">
                  <tr className="text-muted border-b border-subtle text-[10px] uppercase tracking-wider">
                    <th className="pb-2 pt-2 px-3 font-medium">Asset</th>
                    <th className="pb-2 pt-2 px-2 font-medium text-right">
                      Qty
                    </th>
                    <th className="pb-2 pt-2 px-2 font-medium text-right hidden md:table-cell">
                      Avg
                    </th>
                    <th className="pb-2 pt-2 px-2 font-medium text-right hidden lg:table-cell">
                      Current
                    </th>
                    <th className="pb-2 pt-2 px-2 font-medium text-right">
                      Value
                    </th>
                    <th className="pb-2 pt-2 px-2 font-medium text-right">
                      P&L
                    </th>
                    <th className="pb-2 pt-2 px-2 font-medium text-right hidden xl:table-cell">
                      Wt
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                  {sortedHoldings.map((holding) => {
                    const isExpanded = expandedRow === holding.id;
                    const isPositive = holding.unrealizedPnL >= 0;
                    const is24hPositive = holding.change24hPercent >= 0;

                    return (
                      <React.Fragment key={holding.id}>
                        <tr
                          className="group hover:bg-main/30 transition-colors cursor-pointer"
                          onClick={() =>
                            setExpandedRow(isExpanded ? null : holding.id)
                          }
                        >
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                                style={{ backgroundColor: holding.color }}
                              >
                                {holding.asset.slice(0, 2)}
                              </div>
                              <div>
                                <div className="font-bold text-main text-sm">
                                  {holding.asset}
                                </div>
                                <div className="text-[10px] text-muted">
                                  {holding.name}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2 px-2 font-mono text-right text-main font-semibold text-sm">
                            {holding.quantity.toFixed(4)}
                          </td>
                          <td className="py-2 px-2 font-mono text-muted text-right hidden md:table-cell text-sm">
                            ₹
                            {holding.avgPrice.toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td className="py-2 px-2 font-mono text-right hidden lg:table-cell">
                            <div className="font-semibold text-main text-sm">
                              <AnimatedValue
                                value={holding.currentPrice}
                                prefix="₹"
                                decimals={2}
                                size="sm"
                              />
                            </div>
                            <div
                              className={`text-[10px] font-bold ${is24hPositive ? "text-up" : "text-down"}`}
                            >
                              {is24hPositive ? "+" : ""}
                              {holding.change24hPercent.toFixed(2)}%
                            </div>
                          </td>
                          <td className="py-2 px-2 font-mono text-right font-bold text-main text-sm">
                            ₹
                            {holding.value.toLocaleString(undefined, {
                              maximumFractionDigits: 0,
                            })}
                          </td>
                          <td
                            className={`py-2 px-2 font-mono text-right font-bold text-sm ${isPositive ? "text-up" : "text-down"}`}
                          >
                            {isPositive ? "+" : ""}₹
                            {Math.abs(holding.unrealizedPnL).toLocaleString(
                              undefined,
                              { maximumFractionDigits: 0 },
                            )}
                            <div className="text-[10px] opacity-70">
                              ({isPositive ? "+" : ""}
                              {holding.pnLPercentage.toFixed(1)}%)
                            </div>
                          </td>
                          <td className="py-2 px-2 text-right hidden xl:table-cell">
                            <div className="flex items-center justify-end gap-1">
                              <div className="w-10 h-1 bg-main/30 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    backgroundColor: holding.color,
                                    width: `${Math.min(holding.portfolioWeight, 100)}%`,
                                  }}
                                />
                              </div>
                              <span className="font-mono text-[10px] font-bold text-muted w-5 text-right">
                                {holding.portfolioWeight.toFixed(0)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
