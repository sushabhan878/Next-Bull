import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  createBrowserRouter, 
  RouterProvider, 
  Navigate, 
  Outlet 
} from 'react-router-dom';

import { Layout } from './components/layouts';
import { TradePage } from './components/pages/TradePage';
import { MarketsPage } from './components/pages/MarketsPage';
import { PortfolioPage } from './components/pages/PortfolioPage';
import { AnalyticsPage } from './components/pages/AnalyticsPage';
import { HistoryPage } from './components/pages/HistoryPage';
import { LandingPage } from './components/pages/LandingPage'; 
import { LoginPage } from './components/pages/LoginPage';
import { SignUpPage } from './components/pages/SignUpPage';
import { WatchlistPage } from './components/pages/WatchlistPage';
import { useAuth } from './hooks/useAuth';
import { Toaster } from 'react-hot-toast';

export default function App() {
  const [darkMode, setDarkMode] = useState(true);
  const { isAuthenticated, loading, logout } = useAuth();

  const toggleDarkMode = useCallback(() => setDarkMode(prev => !prev), []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  // ─── ROUTER CONFIGURATION (Incoming Change Priority) ─────────────
  // We use createBrowserRouter as per the develop branch for better performance
  // and access to data APIs.
  const router = useMemo(() => createBrowserRouter([
    {
      path: "/",
      element: <LandingPage darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
    },
    {
      path: "/login",
      element: !isAuthenticated ? (
        <LoginPage darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
      ) : (
        <Navigate to="/app/trade" replace />
      )
    },
    {
      path: "/signup",
      element: !isAuthenticated ? (
        <SignUpPage darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
      ) : (
        <Navigate to="/app/trade" replace />
      )
    },
    {
      path: "/app",
      element: isAuthenticated ? (
        <Layout darkMode={darkMode} toggleDarkMode={toggleDarkMode} onLogout={logout}>
          <Outlet /> 
        </Layout>
      ) : (
        <Navigate to="/login" replace />
      ),
      children: [
        { index: true, element: <Navigate to="trade" replace /> },
        { path: "trade", element: <TradePage darkMode={darkMode} /> },
        { path: "markets", element: <MarketsPage /> },
        { path: "watchlist", element: <WatchlistPage /> }, // Integrated from HEAD
        { path: "analytics", element: <AnalyticsPage /> },
        { path: "portfolio", element: <PortfolioPage /> },
        { path: "history", element: <HistoryPage /> },
      ]
    }
  ]), [darkMode, isAuthenticated, logout, toggleDarkMode]);

  // Loading state handled after the hook definition to avoid "Rules of Hooks" violations
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
  <>
    <Toaster position="top-right" reverseOrder={false} />
    <RouterProvider router={router} />
  </>
);
}