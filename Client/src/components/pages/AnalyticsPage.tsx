import { useState } from 'react';
import { TrendingUp, DollarSign, BarChart2, Award, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface StatCard {
  label: string;
  value: string;
  change?: string;
  isPositive?: boolean;
  icon: React.ReactNode;
}

export function AnalyticsPage() {
  const [timeframe, setTimeframe] = useState('1M');

  const portfolioHistory = {
    '1W': [45000, 44800, 46200, 45500, 47000, 46800, 48200],
    '1M': [38000, 39200, 38500, 40100, 41500, 39800, 42000, 43500, 41200, 43800, 44200, 42500, 45000, 44800, 46200, 45500, 47000, 46800, 48200, 47500],
    '3M': Array.from({length: 40}, () => 35000 + Math.random() * 15000),
    'ALL': Array.from({length: 60}, () => 20000 + Math.random() * 30000)
  }[timeframe] || [];

  const allocation = [
    { symbol: 'BTC', percentage: 45, color: '#F7931A' },
    { symbol: 'ETH', percentage: 25, color: '#627EEA' },
    { symbol: 'SOL', percentage: 15, color: '#9945FF' },
    { symbol: 'Others', percentage: 15, color: '#888888' },
  ];

  const dailyPnL = Array.from({ length: 14 }).map(() => (Math.random() - 0.4) * 1000);

  const [recentTrades] = useState([
    { symbol: 'BTC/INR', side: 'Buy', price: 62450, pnl: +801.22, date: '2024-03-24' },
    { symbol: 'ETH/INR', side: 'Sell', price: 3450, pnl: +147.97, date: '2024-03-23' },
    { symbol: 'SOL/INR', side: 'Buy', price: 152, pnl: -159.75, date: '2024-03-22' },
    { symbol: 'BTC/INR', side: 'Sell', price: 63100, pnl: +520.40, date: '2024-03-21' },
    { symbol: 'AVAX/INR', side: 'Buy', price: 28, pnl: +608.00, date: '2024-03-20' },
  ]);

  const stats: StatCard[] = [
    { label: 'Total Trades', value: '247', change: '+12 this week', isPositive: true, icon: <BarChart2 size={18} /> },
    { label: 'Win Rate', value: '68.2%', change: '+2.1%', isPositive: true, icon: <Award size={18} /> },
    // Updated to ₹
    { label: 'Avg Profit', value: '₹342.50', change: '+₹45.20', isPositive: true, icon: <DollarSign size={18} /> },
    { label: 'Best Trade', value: '+₹2,450', change: 'BTC/INR', icon: <TrendingUp size={18} /> },
  ];

  return (
    <div className="flex flex-col w-full h-full gap-0 overflow-hidden select-none font-sans">
      {/* Stat Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 shrink-0 pb-[2px]">
        {stats.map((stat, i) => (
          <div key={i} className={`${i === 0 ? '' : 'pl-[2px]'}`}>
            <div className="glass-panel rounded-lg p-3 flex flex-col h-full">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-muted uppercase tracking-wider font-medium">{stat.label}</span>
                <div className="text-muted">{stat.icon}</div>
              </div>
              <div className="text-xl font-bold text-main font-mono">{stat.value}</div>
              {stat.change && (
                <div className={`text-[10px] mt-1 ${stat.isPositive ? 'text-up' : 'text-down'}`}>
                  {stat.change}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Main Content */}
      <div className="flex flex-col lg:flex-row gap-0 flex-1 min-h-0 overflow-y-auto lg:overflow-hidden no-scrollbar pt-[2px]">

        {/* Left Column: Charts Column */}
        <div className="flex-1 flex flex-col gap-0 min-h-0 min-w-0 pr-1">

          {/* Portfolio Performance Chart Panel */}
          <div className="flex-[2] pb-1 min-w-0">
            <div className="glass-panel rounded-lg flex flex-col overflow-hidden h-full">
              <div className="px-3 py-2 border-b border-main font-semibold text-sm flex items-center justify-between flex-wrap gap-2">
                <span className="shrink-0">Portfolio Performance</span>
                <div className="flex gap-1 flex-wrap overflow-x-auto no-scrollbar">
                  {['1W', '1M', '3M', 'ALL'].map(period => (
                    <button
                      key={period}
                      onClick={() => setTimeframe(period)}
                      className={`text-xs font-bold px-2 py-1 rounded transition-colors whitespace-nowrap ${
                        period === timeframe
                          ? 'bg-panel border border-white/20 text-main'
                          : 'text-muted hover:text-main hover:bg-panel'
                      }`}>
                      {period}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 p-3 flex items-center overflow-x-auto min-w-0">
                <div className="h-full flex items-end gap-[1px] min-w-full">
                  {portfolioHistory.map((value, i) => {
                    const max = Math.max(...portfolioHistory);
                    const min = Math.min(...portfolioHistory);
                    const height = ((value - min) / (max - min)) * 100;
                    const isLast = i === portfolioHistory.length - 1;
                    return (
                      <div key={i} className="flex-1 min-w-[3px] max-w-[30px] flex flex-col items-center justify-end h-full group">
                        {/* Updated Tooltip to ₹ */}
                        <div className="text-[10px] text-main font-bold opacity-0 group-hover:opacity-100 transition-opacity mb-1 font-mono">
                          ₹{(value / 1000).toFixed(1)}k
                        </div>
                        <div
                          className="w-full rounded-t-sm transition-all bg-up hover:brightness-125"
                          style={{ height: `${Math.max(height, 5)}%`, opacity: isLast ? 1 : 0.6 }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Asset Allocation & Daily P&L Panel Row */}
          <div className="flex-1 flex flex-col sm:flex-row gap-0 min-h-[160px] min-w-0 pt-1">
            {/* Daily P&L Panel */}
            <div className="flex-1 pr-0.5">
              <div className="glass-panel rounded-lg flex flex-col overflow-hidden h-full p-3">
                <div className="font-semibold text-sm mb-2">Daily P&L (14D)</div>
                <div className="flex-1 flex items-end justify-between gap-1">
                  {dailyPnL.map((pnl, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                      {pnl >= 0 ? (
                        <div className="w-full bg-up opacity-80 rounded-t-sm hover:opacity-100 transition-all" style={{ height: `${(pnl / 1000) * 100}%` }} />
                      ) : (
                        <div className="w-full bg-down opacity-80 rounded-b-sm hover:opacity-100 transition-all absolute top-full" style={{ height: `${Math.abs(pnl) / 1000 * 100}%` }} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Asset Allocation Panel */}
            <div className="flex-1 pl-0.5">
              <div className="glass-panel rounded-lg flex flex-col overflow-hidden h-full p-3">
                <div className="font-semibold text-sm mb-2">Asset Allocation</div>
                <div className="flex flex-col gap-2 flex-1 justify-center">
                  {allocation.map(a => (
                    <div key={a.symbol} className="flex flex-col gap-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-bold text-main">{a.symbol}</span>
                        <span className="font-mono text-muted">{a.percentage}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-main opacity-30 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${a.percentage}%`, backgroundColor: a.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column: Recent Trades Panel */}
        <div className="w-full lg:w-[280px] pl-1">
          <div className="glass-panel rounded-lg flex flex-col overflow-hidden h-full">
            <div className="px-3 py-2 border-b border-main font-semibold text-sm">Recent Trades</div>
            <div className="flex-1 overflow-auto no-scrollbar p-2">
              {recentTrades.map((trade, i) => (
                <div key={i} className="px-2 py-2 flex items-center justify-between border-b border-subtle hover:bg-panel/50 transition-colors rounded group">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center transition-transform group-hover:scale-110" style={{ backgroundColor: trade.side === 'Buy' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)' }}>
                      {trade.side === 'Buy' ? <ArrowUpRight size={12} className="text-up" /> : <ArrowDownRight size={12} className="text-down" />}
                    </div>
                    <div>
                      <div className="font-bold text-main text-sm">{trade.symbol}</div>
                      <div className="text-[10px] text-muted">{trade.date}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    {/* Updated PnL to ₹ */}
                    <div className={`font-mono font-bold text-sm ${trade.pnl >= 0 ? 'text-up' : 'text-down'}`}>
                      {trade.pnl >= 0 ? '+' : ''}₹{Math.abs(trade.pnl).toFixed(2)}
                    </div>
                    {/* Updated Price to ₹ */}
                    <div className="text-[10px] text-muted font-mono">₹{trade.price.toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}