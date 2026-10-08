import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../config';
import { MarketPriceData } from './useMarketPrices';

const POLL_INTERVAL_MS = 10_000;

export function useWatchlistData() {
  const [data, setData] = useState<MarketPriceData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWatchlist = useCallback(async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setData([]);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/watchlist`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (Array.isArray(json.data)) {
        setData(json.data as MarketPriceData[]);
      }
    } catch (err) {
      console.error('Failed to fetch watchlist data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWatchlist();
    const interval = setInterval(fetchWatchlist, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchWatchlist]);

  return { data, loading, refetch: fetchWatchlist };
}
