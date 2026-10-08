import { useState, useCallback, useMemo, useEffect } from 'react';
import { API_BASE_URL } from '../config';

export interface Holding {
  id: string;
  asset: string;
  name: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  change24hPercent: number;
  color: string;
  sparklineData: number[];
  value: number;
  unrealizedPnL: number;
  pnLPercentage: number;
  portfolioWeight: number;
}

const getAssetColor = (asset: string) => {
  const colors: Record<string, string> = {
    BTC: '#F7931A', ETH: '#627EEA', SOL: '#9945FF',
    AVAX: '#E84142', LINK: '#2A5ADA', DOGE: '#C2A633',
    NVDA: '#76B900',
  };
  return colors[asset?.toUpperCase()] || '#888888';
};

export function usePortfolio() {
  const [holdingsData, setHoldingsData] = useState<any[]>([]);
  const [cashBalance, setCashBalance] = useState(0);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');

  const updatePrice = useCallback((symbol: string, newPrice: number, change24h: number) => {
    setHoldingsData(prev => prev.map(h => {
      if (h.asset.toLowerCase() !== symbol.toLowerCase()) return h;

      const sparklineData = h.sparklineData || Array(8).fill(newPrice);
      const newSparkline = [...sparklineData.slice(1), newPrice];

      return { ...h, currentPrice: newPrice, change24hPercent: change24h, sparklineData: newSparkline };
    }));
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('access_token');

    if (!token) {
      console.warn('WebSocket: No auth token found.');
      return;
    }

    const wsUrl = API_BASE_URL.replace(/^http/, 'ws') + `/ws?token=${token}`;
    let ws: WebSocket;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    const connect = () => {
      setWsStatus('connecting');
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WS] Connected');
        setWsStatus('connected');
        ws.send(JSON.stringify({ action: 'subscribe', topic: 'portfolio:data' }));
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          // console.log('[WS] Message received:', JSON.stringify(payload).slice(0, 300));

          // --- Handle initial portfolio data ---
          if (payload.data?.portfolio) {
            const portfolio = payload.data.portfolio;
            console.log('[WS] Portfolio snapshot received. Balance:', portfolio.balance, 'Holdings:', portfolio.holdings?.length);
            setCashBalance(portfolio.balance || 0);

            if (portfolio.holdings) {
              const formattedHoldings = portfolio.holdings.map((h: any) => ({
                id: h.symbol,
                asset: h.symbol,
                name: h.symbol,
                quantity: h.quantity,
                avgPrice: h.avg_price || 0,
                currentPrice: h.current_price || h.avg_price || 0,
                change24hPercent: 0,
                color: getAssetColor(h.symbol),
                sparklineData: Array(8).fill(h.current_price || h.avg_price || 0),
              }));
              setHoldingsData(formattedHoldings);
            }
            return;
          }

          // --- Handle live price updates ---
          // Flexibly extract fields so it works regardless of your backend's exact key names
          const type = payload.type || payload.event || payload.action;
          const symbol = payload.asset || payload.symbol || payload.ticker;
          const price = payload.newPrice ?? payload.price ?? payload.current_price;
          const change = payload.change24h ?? payload.change24hPercent ?? 0;

          if (type === 'PRICE_UPDATE' && symbol != null && price != null) {
            console.log(`[WS] Price update: ${symbol} -> ${price} (${change}%)`);
            updatePrice(symbol, price, change);
            return;
          }

          // --- Catch-all for unrecognized messages ---
          console.log('[WS] Unhandled message type:', type, payload);
        } catch (error) {
          console.error('[WS] Failed to parse message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[WS] Error:', error);
        setWsStatus('error');
      };

      ws.onclose = (event) => {
        console.log(`[WS] Closed (code: ${event.code}, reason: ${event.reason})`);
        setWsStatus('disconnected');

        // Auto-reconnect after 3 seconds unless it was a clean close
        if (event.code !== 1000) {
          // console.log('[WS] Reconnecting in 3s...');
          reconnectTimeout = setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close(1000, 'Component unmounted');
      }
    };
  }, [updatePrice]);

  // --- Math engine ---
  const holdings: Holding[] = useMemo(() => {
    if (!holdingsData.length) return [];

    const rawHoldings = holdingsData.map(h => {
      const value = h.quantity * h.currentPrice;
      const costBasis = h.quantity * h.avgPrice;
      const unrealizedPnL = value - costBasis;
      const pnLPercentage = h.avgPrice > 0 ? ((h.currentPrice - h.avgPrice) / h.avgPrice) * 100 : 0;
      return { ...h, value, unrealizedPnL, pnLPercentage, portfolioWeight: 0 };
    });

    const totalValue = rawHoldings.reduce((sum, h) => sum + h.value, 0) + cashBalance;
    return rawHoldings.map(h => ({ ...h, portfolioWeight: totalValue > 0 ? (h.value / (totalValue - cashBalance)) * 100 : 0 }));
  }, [holdingsData, cashBalance]);

  const totalPortfolioValue = useMemo(() => holdings.reduce((sum, h) => sum + h.value, 0) + cashBalance, [holdings, cashBalance]);
  const totalUnrealizedPnL = useMemo(() => holdings.reduce((sum, h) => sum + h.unrealizedPnL, 0), [holdings]);
  const totalPnLPercentage = useMemo(() => {
    const totalCost = holdings.reduce((sum, h) => sum + h.quantity * h.avgPrice, 0);
    return totalCost > 0 ? (totalUnrealizedPnL / totalCost) * 100 : 0;
  }, [holdings, totalUnrealizedPnL]);

  const riskMetrics = useMemo(() => ({ sharpeRatio: 1.85, maxDrawdown: -12.4, volatility: 24.6, winRate: 68.2 }), []);
  const concentrationWarning = useMemo(() => {
    if (!holdings.length) return null;
    const maxHolding = holdings.reduce((prev, curr) => curr.portfolioWeight > prev.portfolioWeight ? curr : prev, holdings[0]);
    return maxHolding && maxHolding.portfolioWeight > 40 ? { asset: maxHolding.asset, percentage: maxHolding.portfolioWeight } : null;
  }, [holdings]);

  return { holdings, cashBalance, totalPortfolioValue, totalUnrealizedPnL, totalPnLPercentage, riskMetrics, concentrationWarning, wsStatus, updatePrice };
}