import { useState, useEffect, useCallback, ReactNode, useContext } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { TopNav } from "./TopNav";
import { SideNav } from "./SideNav";
import { MOCK_POSITIONS, MarketPair, Position } from "../../data/mockData";
import { API_BASE_URL } from "../../config";
import { SYMBOL_META } from "../../data/symbolMeta";
import { useMarketPrices, MarketPriceData } from "../../hooks/useMarketPrices";
import { usePortfolio, Holding } from "../../hooks/usePortfolio";

// 👇 IMPORTANT: Adjust this import path to match where your AuthContext is located
import { AuthContext } from "../../context/AuthContext";

interface LayoutProps {
  children?: ReactNode;
  darkMode: boolean;
  toggleDarkMode: () => void;
  onLogout: () => void;
}

export interface DashboardContextType {
  activeSymbol: string;
  setActiveSymbol: (symbol: string) => void;
  markets: MarketPair[];
  positions: Position[];
  holdings: Holding[];
  updatePrice: (id: string, newPrice: number, change24h: number) => void;
  watchlist: string[];
  toggleWatchlist: (symbol: string) => Promise<void>;
}

export function Layout({ darkMode, toggleDarkMode, onLogout }: LayoutProps) {
  const navigate = useNavigate();

  // Get the access token directly from your AuthContext
  const authContext = useContext(AuthContext);
  const accessToken = authContext?.accessToken;
  // 1. Initialize global state
  const [activeSymbol, setActiveSymbol] = useState("");
  const [markets, setMarkets] = useState<MarketPair[]>([]);
  const [positions, setPositions] = useState<Position[]>(MOCK_POSITIONS);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Portfolio holdings streamed via WebSocket (single shared connection)
  const { holdings, updatePrice } = usePortfolio();

  // Fetch assets and watchlist from the backend API
  useEffect(() => {
    // Fetch Assets (Public/No Auth Needed usually)
    fetch(`${API_BASE_URL}/assets`)
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "OK" && Array.isArray(data.data)) {
          const fetched: MarketPair[] = data.data.map((asset: any) => {
            const meta = SYMBOL_META[asset.ticker] || {
              displaySymbol: asset.ticker,
              name: asset.class,
              icon: asset.ticker[0],
              iconColor: "bg-main border border-main",
            };
            return {
              symbol: asset.ticker,
              displaySymbol: meta.displaySymbol,
              name: meta.name,
              price: `₹${Number(asset.start_price).toFixed(2)}`,
              change: "+0.00%",
              high: "-",
              low: "-",
              isPositive: true,
              icon: meta.icon,
              iconColor: meta.iconColor,
            };
          });
          setMarkets(fetched);
          if (fetched.length > 0 && !activeSymbol) {
            setActiveSymbol(fetched[0].symbol);
          }
        }
      })
      .catch((err) => console.error("Failed to fetch assets:", err));

    // Fetch Watchlist ONLY if we have an accessToken
    if (accessToken) {
      fetch(`${API_BASE_URL}/watchlist`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      })
        .then((res) => {
          if (res.status === 401) {
            console.warn("Session expired (401), logging out...");
            onLogout();
            return;
          }
          if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
          return res.json();
        })
        .then((data) => {
          const payload = data.data || data;
          if (Array.isArray(payload)) {
            const watchlistSymbols = payload.map((item: any) =>
              typeof item === "string" ? item : item.symbol,
            );
            setWatchlist(watchlistSymbols);
          }
        })
        .catch((err) => console.error("Failed to fetch watchlist:", err));
    } else {
      // Clear watchlist if the user logs out / token is null
      setWatchlist([]);
    }
  }, [accessToken]); // Dependency added so it re-fetches automatically when the token changes

  // 2. Updated toggle function to handle backend synchronization
  const toggleWatchlist = async (symbol: string) => {
    if (!accessToken) {
      console.error("No authentication token found. Cannot modify watchlist.");
      return;
    }

    const isWatched = watchlist.includes(symbol);

    // Optimistic UI update (feels instant to the user)
    setWatchlist((prev) =>
      isWatched ? prev.filter((s) => s !== symbol) : [...prev, symbol],
    );

    try {
      const method = isWatched ? "DELETE" : "POST";
      const response = await fetch(`${API_BASE_URL}/watchlist/${symbol}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          console.warn("Session expired (401), logging out...");
          onLogout();
          return;
        }
        throw new Error(`HTTP Error: ${response.status}`);
      }
    } catch (err) {
      console.error(
        `Failed to ${isWatched ? "remove from" : "add to"} watchlist:`,
        err,
      );
      // Revert state if the API call fails
      setWatchlist((prev) =>
        isWatched ? [...prev, symbol] : prev.filter((s) => s !== symbol),
      );
    }
  };

  // 3. Live price updates via WebSocket
  const handlePriceUpdate = useCallback((prices: MarketPriceData[]) => {
    setMarkets((prev) =>
      prev.map((m) => {
        const update = prices.find((p) => p.symbol === m.symbol);
        if (!update) return m;
        const change = update.change_24h;
        return {
          ...m,
          price: `₹${update.price.toFixed(2)}`,
          change: `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`,
          high: update.high_24h > 0 ? `₹${update.high_24h.toFixed(2)}` : "-",
          low: update.low_24h > 0 ? `₹${update.low_24h.toFixed(2)}` : "-",
          isPositive: change >= 0,
        };
      }),
    );
  }, []);

  useMarketPrices(handlePriceUpdate);

  return (
    <div className="min-h-screen flex transition-colors duration-300 bg-main text-main font-sans">
      <SideNav onLogout={onLogout} isMobileOpen={isMobileNavOpen} closeMobileNav={() => setIsMobileNavOpen(false)} />

      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <TopNav
          darkMode={darkMode}
          toggleDarkMode={toggleDarkMode}
          toggleMobileNav={() => setIsMobileNavOpen(!isMobileNavOpen)}
          onLogout={onLogout}
          onProfileClick={() => navigate("/app/portfolio")}
          activeSymbol={activeSymbol}
          onSymbolChange={setActiveSymbol}
          markets={markets}
          watchlist={watchlist}
          toggleWatchlist={toggleWatchlist}
        />
        
        <main className="flex-1 p-2 overflow-auto md:overflow-hidden flex gap-2 w-full">
          {/* 2. Pass everything down through the Outlet context */}
          <Outlet context={{ activeSymbol, setActiveSymbol, markets, positions, holdings, updatePrice, watchlist, toggleWatchlist } satisfies DashboardContextType} />
        </main>
      </div>
    </div>
  );
}
