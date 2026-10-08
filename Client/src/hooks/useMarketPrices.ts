import { useEffect, useRef } from "react";
import { API_BASE_URL } from "../config";

export interface MarketPriceData {
  symbol: string;
  price: number;
  change_24h: number;
  high_24h: number;
  low_24h: number;
  volume_24h: number;
  sparkline: number[];
}

export function useMarketPrices(onUpdate: (prices: MarketPriceData[]) => void) {
  const callbackRef = useRef(onUpdate);
  useEffect(() => { callbackRef.current = onUpdate; });

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    const wsUrl = API_BASE_URL.replace(/^http/, 'ws') + `/ws?token=${token}`;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(JSON.stringify({ action: "subscribe", topic: "prices:all" }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.topic === "prices:all" && Array.isArray(msg.data)) {
          callbackRef.current(msg.data);
        }
      } catch (err) {
        console.error("Failed to parse market prices WS message", err);
      }
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, []);
}
