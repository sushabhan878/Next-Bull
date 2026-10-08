import { useMemo } from "react";
import { useOrderBook, PriceLevel } from "../../hooks/useOrderBook";

interface OrderBookProps {
  symbol: string;
}

export function OrderBook({ symbol }: OrderBookProps) {
  const snapshot = useOrderBook(symbol);

  const maxQty = useMemo(() => {
    if (!snapshot) return 1;
    const allQty = [...(snapshot.bids || []), ...(snapshot.asks || [])].map(
      (l) => l.quantity,
    );
    return Math.max(...allQty, 1);
  }, [snapshot]);

  const asks = useMemo(() => {
    if (!snapshot?.asks) return [];
    // Show up to 15 levels, reversed so best ask is at the bottom of the asks section
    const levels = snapshot.asks.slice(0, 15);
    let cumTotal = 0;
    const withTotals = levels.map((l) => {
      cumTotal += l.quantity;
      return { ...l, total: cumTotal, depthWidth: (l.quantity / maxQty) * 100 };
    });
    return withTotals.reverse();
  }, [snapshot, maxQty]);

  const bids = useMemo(() => {
    if (!snapshot?.bids) return [];
    const levels = snapshot.bids.slice(0, 15);
    let cumTotal = 0;
    return levels.map((l) => {
      cumTotal += l.quantity;
      return { ...l, total: cumTotal, depthWidth: (l.quantity / maxQty) * 100 };
    });
  }, [snapshot, maxQty]);

  const bestAsk = snapshot?.asks?.[0]?.price;
  const bestBid = snapshot?.bids?.[0]?.price;
  const midPrice = snapshot?.mid_price;
  const spread = bestAsk && bestBid ? (bestAsk - bestBid).toFixed(2) : "-";

  return (
    <div className="flex flex-col h-full bg-panel w-full text-xs font-mono select-none">
      <div className="flex justify-between text-muted mb-2 px-1 text-[10px] font-sans font-medium uppercase tracking-wider">
        <span>Price (INR)</span>
        <span>Qty</span>
        <span>Total</span>
      </div>

      {/* Asks (Red) */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col justify-start">
        {asks.length === 0 ? (
          <div className="text-center text-muted py-4">Waiting for data...</div>
        ) : (
          asks.map((ask, i) => (
            <div
              key={i}
              className="flex justify-between relative py-0.5 hover:bg-panel cursor-pointer group transition-colors"
            >
              <div
                className="absolute right-0 top-0 bottom-0 bg-red-500/10 transition-all group-hover:bg-red-500/20"
                style={{ width: `${ask.depthWidth}%` }}
              />
              <span className="text-down z-10 pl-1">
                {ask.price.toFixed(2)}
              </span>
              <span className="text-main z-10">{ask.quantity}</span>
              <span className="text-muted z-10 pr-1">{ask.total}</span>
            </div>
          ))
        )}
      </div>

      {/* Spread / Current Price */}
      <div className="py-2 flex items-center justify-between border-y border-main my-1 px-1 bg-transparent">
        <span className="text-up font-bold text-base flex items-center gap-1 font-mono">
          {midPrice ? midPrice.toFixed(2) : "-"}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-up"
          >
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </span>
        <span className="text-muted text-[10px] font-mono">
          Spread: {spread}
        </span>
      </div>

      {/* Bids (Green) */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col justify-start">
        {bids.length === 0 ? (
          <div className="text-center text-muted py-4">Waiting for data...</div>
        ) : (
          bids.map((bid, i) => (
            <div
              key={i}
              className="flex justify-between relative py-0.5 hover:bg-panel cursor-pointer group transition-colors"
            >
              <div
                className="absolute right-0 top-0 bottom-0 bg-green-500/10 transition-all group-hover:bg-green-500/20"
                style={{ width: `${bid.depthWidth}%` }}
              />
              <span className="text-up z-10 pl-1">{bid.price.toFixed(2)}</span>
              <span className="text-main z-10">{bid.quantity}</span>
              <span className="text-muted z-10 pr-1">{bid.total}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
