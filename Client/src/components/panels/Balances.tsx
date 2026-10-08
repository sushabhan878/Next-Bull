import { Star, TrendingUp, TrendingDown } from 'lucide-react';
import { useWatchlistData } from '../../hooks/useWatchlistData';
import { getSymbolMeta } from '../../data/symbolMeta';
import { API_BASE_URL } from '../../config';

export function Balances() {
  const { data, loading, refetch } = useWatchlistData();

  const handleRemove = async (symbol: string) => {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    try {
      await fetch(`${API_BASE_URL}/watchlist/${symbol}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      refetch();
    } catch (err) {
      console.error('Failed to remove from watchlist:', err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-panel text-sm w-full font-sans">
      <div className="flex justify-between items-start px-3 py-2 border-b border-main shrink-0">
        <div className="flex bg-main p-1 rounded-lg border border-main shrink-0">
          <button className="text-[10px] uppercase font-bold px-3 py-1.5 rounded-md transition-colors text-white">
            Watchlist
          </button>
        </div>
      </div>

      <div className="flex-1 p-2 flex flex-col min-h-0 overflow-hidden">
        <div className="flex flex-col gap-2 overflow-y-auto pr-1 no-scrollbar flex-1">
          {loading ? (
            <div className="text-center text-muted text-xs py-4">Loading...</div>
          ) : data.length === 0 ? (
            <div className="text-center text-muted text-xs py-4">No symbols in watchlist</div>
          ) : (
            data.map(item => {
              const meta = getSymbolMeta(item.symbol);
              const isPositive = item.change_24h >= 0;
              return (
                <div
                  key={item.symbol}
                  className="flex justify-between items-center bg-panel/50 p-2 rounded-lg border border-main/50 hover:border-white/20 transition-colors cursor-pointer group"
                >
                  <div className="flex gap-2 items-center">
                    <button
                      onClick={() => handleRemove(item.symbol)}
                      className="text-yellow-400 hover:text-muted transition-colors"
                      title="Remove from watchlist"
                    >
                      <Star size={14} fill="currentColor" />
                    </button>
                    <div className="flex flex-col leading-tight">
                      <span className="font-semibold text-main">{item.symbol}</span>
                      <span className="text-[10px] text-muted">{meta.name}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end leading-tight">
                    <span className="font-semibold text-main font-mono">₹{item.price.toFixed(2)}</span>
                    <span className={`text-[10px] font-bold flex items-center gap-0.5 ${isPositive ? 'text-up' : 'text-down'}`}>
                      {isPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                      {isPositive ? '+' : ''}{item.change_24h.toFixed(2)}%
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
