import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "../config";

export interface PriceLevel {
  price: number;
  quantity: number;
}

export interface LOBSnapshot {
  symbol: string;
  bids: PriceLevel[];
  asks: PriceLevel[];
  mid_price: number;
}

export function useOrderBook(symbol: string) {
  const [snapshot, setSnapshot] = useState<LOBSnapshot | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!symbol) return;

    const token = localStorage.getItem("access_token");
    if (!token) return;

    const wsUrl = API_BASE_URL.replace(/^http/, 'ws') + `/ws?token=${token}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log(`OrderBook WS connected for ${symbol}`);
      ws.send(JSON.stringify({ action: "subscribe", topic: `orderbook:${symbol}` }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.topic === `orderbook:${symbol}` && msg.data) {
          setSnapshot(msg.data as LOBSnapshot);
        }
      } catch (err) {
        console.error("Failed to parse orderbook WS message", err);
      }
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
        console.log(`OrderBook WS closed for ${symbol}`);
      }
      setSnapshot(null);
    };
  }, [symbol]);

  return snapshot;
}
