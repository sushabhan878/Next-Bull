import { 
  Moon, Sun, Search, ChevronDown, LogOut, User, ChevronRight,
  BarChart2, PieChart, Star, History, LineChart, Activity, Menu
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom'; // <-- NEW: Import useLocation
import { MarketPair } from '../../data/mockData'; 

interface TopNavProps {
  darkMode: boolean;
  toggleDarkMode: () => void;
  toggleMobileNav: () => void;
  onLogout: () => void;
  onProfileClick: () => void;
  activeSymbol: string; 
  onSymbolChange: (symbol: string) => void;
  markets: MarketPair[]; 
  watchlist: string[];
  toggleWatchlist: (symbol: string) => Promise<void>;
}

export function TopNav({ 
  darkMode, 
  toggleDarkMode, 
  toggleMobileNav,
  onLogout, 
  onProfileClick, 
  activeSymbol, 
  onSymbolChange,
  markets,
  watchlist,
  toggleWatchlist
}: TopNavProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const pickerRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  
  // --- NEW: Get current route to determine what to show ---
  const location = useLocation();
  const isTradePage = location.pathname.includes('/trade');

  const currentPair = markets.find(p => p.symbol === activeSymbol) || markets[0];
  const stored = localStorage.getItem('user');
  const data = stored ? JSON.parse(stored) : null;
  const name = data?.fullName;
  const filteredPairs = markets.filter(p =>
    p.displaySymbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsPickerOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- NEW: Helper to render the correct title/icon for non-trade pages ---
  const getPageContext = () => {
    if (location.pathname.includes('/markets')) return { title: 'Markets Overview', icon: <BarChart2 size={18} /> };
    if (location.pathname.includes('/watchlist')) return { title: 'My Watchlist', icon: <Star size={18} /> };
    if (location.pathname.includes('/portfolio')) return { title: 'Portfolio', icon: <PieChart size={18} /> };
    if (location.pathname.includes('/analytics')) return { title: 'Analytics Dashboard', icon: <LineChart size={18} /> };
    if (location.pathname.includes('/history')) return { title: 'Trade History', icon: <History size={18} /> };
    return { title: 'Dashboard', icon: <Activity size={18} /> };
  };

  const pageContext = getPageContext();

  return (
    <header className="h-12 md:h-14 border-b border-main bg-panel flex items-center justify-between px-2 md:px-4 shrink-0 shadow-sm z-50 transition-colors font-sans w-full">
      <div className="flex items-center gap-1 md:gap-4 flex-1 min-w-0">
        
        {/* Mobile Menu & Logo */}
        <div className="flex items-center gap-1.5 md:gap-2 pr-2 md:pr-4 border-r border-main shrink-0">
          <button 
            onClick={toggleMobileNav}
            className="md:hidden p-1 text-muted hover:text-main transition-colors"
            title="Open Menu"
          >
            <Menu size={18} />
          </button>
          <img src="/assets/images/logo.webp" alt="NextBull Logo" className="h-5 sm:h-6 md:h-8 w-auto" />
          <span className="font-semibold text-base md:text-xl tracking-wide text-white hidden sm:block">NEXTBULL</span>
        </div>

        {/* --- CONDITIONAL RENDERING --- */}
        {isTradePage ? (
          <div className="flex items-center flex-1 min-w-0 gap-1 md:gap-2">
            {/* Premium Coin Picker (Trade Page Only) */}
            <div className="relative shrink-0" ref={pickerRef}>
              <button
                onClick={() => setIsPickerOpen(!isPickerOpen)}
                className={`flex items-center justify-between gap-1 md:gap-3 w-24 sm:w-40 md:w-56 px-2 md:px-3 py-1 md:py-1.5 rounded-md border transition-all duration-200 group
                  ${isPickerOpen
                    ? 'border-white bg-main'
                    : 'border-main bg-main/50 hover:border-white/50'}`}
              >
                <Search size={14} className={`shrink-0 hidden sm:block ${isPickerOpen ? 'text-main' : 'text-muted group-hover:text-main'}`} />
                <span className="flex-1 text-left text-[11px] md:text-sm font-bold text-main truncate">{currentPair?.displaySymbol || activeSymbol}</span>
                <ChevronDown size={14} className={`text-muted shrink-0 transition-transform duration-200 ${isPickerOpen ? 'rotate-180' : ''}`} />
              </button>

              {isPickerOpen && (
                <div className="absolute top-full left-0 mt-2 w-80 bg-main border border-main rounded-lg shadow-black/40 z-[100] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="p-2 border-b border-main">
                    <div className="flex items-center gap-2 bg-panel rounded-md px-3 py-2 border border-main focus-within:border-white transition-colors">
                      <Search size={14} className="text-muted" />
                      <input
                        autoFocus
                        type="text"
                        placeholder="Search symbols..."
                        className="bg-transparent outline-none flex-1 text-sm text-main"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="max-h-80 overflow-y-auto no-scrollbar">
                    <div className="p-2 flex gap-2 border-b border-trading-border">
                      {['All'].map(cat => (
                        <button key={cat} className={`text-[10px] uppercase font-bold px-3 py-1 rounded-full border transition-all ${cat === 'All' ? 'bg-panel border-white text-main' : 'border-main text-muted hover:text-main hover:border-white/50'}`}>{cat}</button>
                      ))}
                    </div>
                    {filteredPairs.map((pair) => {
                      const isWatched = watchlist.includes(pair.symbol);
                      return (
                      <div
                        key={pair.symbol}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          onSymbolChange(pair.symbol);
                          setIsPickerOpen(false);
                        }}
                        className="w-full flex items-center justify-between p-3 hover:bg-panel transition-colors group cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 ${pair.iconColor || 'bg-main border border-main'} rounded-full flex items-center justify-center text-sm font-bold text-white shadow-sm transition-transform group-hover:scale-110`}>
                            {pair.icon}
                          </div>
                          <div className="flex flex-col items-start leading-tight">
                            <span className="font-bold text-sm text-main">{pair.displaySymbol}</span>
                            <span className="text-xs text-muted">{pair.name}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-xs font-mono font-bold text-main">{pair.price}</span>
                            <span className={`text-[10px] font-bold ${pair.isPositive ? 'text-up' : 'text-down'}`}>{pair.change}</span>
                          </div>
                          {activeSymbol === pair.symbol && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleWatchlist(pair.symbol);
                            }}
                            className={`p-0.5 transition-colors ${isWatched ? 'text-yellow-400' : 'text-muted hover:text-yellow-400'}`}
                            title={isWatched ? 'Remove from Watchlist' : 'Add to Watchlist'}
                          >
                            <Star size={14} fill={isWatched ? 'currentColor' : 'none'} />
                          </button>
                        </div>
                      </div>
                    )})}
                    {filteredPairs.length === 0 && (
                      <div className="p-8 text-center text-muted text-sm">No results found for "{searchQuery}"</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Dynamic header stats (Trade Page Only) */}
            <div className="flex items-center gap-2 md:gap-8 border-l border-main pl-2 md:pl-8 min-w-0">
              {currentPair && (
                <>
                  <div className="flex items-baseline gap-1 md:gap-2 truncate">
                    <span className={`font-bold text-[13px] md:text-base tracking-tight font-mono ${currentPair.isPositive ? 'text-up' : 'text-down'}`}>
                      {currentPair.price}
                    </span>
                    <span className={`text-[10px] md:text-xs font-semibold ${currentPair.isPositive ? 'text-up' : 'text-down'} hidden sm:inline`}>
                      {currentPair.change}
                    </span>
                  </div>
                  <div className="hidden lg:flex items-baseline gap-2">
                    <span className="text-xs text-muted uppercase tracking-wider font-bold">High</span>
                    <span className="text-sm font-mono font-bold text-muted">{currentPair.high}</span>
                  </div>
                  <div className="hidden lg:flex items-baseline gap-2">
                    <span className="text-xs text-muted uppercase tracking-wider font-bold">Low</span>
                    <span className="text-sm font-mono font-bold text-muted">{currentPair.low}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          /* --- ALTERNATIVE UI FOR NON-TRADE PAGES --- */
          <div className="flex items-center gap-2 px-2 text-muted animate-in fade-in slide-in-from-left-2 duration-300 truncate">
            <span className="shrink-0">{pageContext.icon}</span>
            <span className="font-bold text-sm md:text-base text-main tracking-tight truncate">{pageContext.title}</span>
          </div>
        )}
      </div>

      {/* Right Side Settings (Always visible) */}
      <div className="flex items-center gap-1 md:gap-3 shrink-0 ml-1 md:ml-3">
        <button
          onClick={toggleDarkMode}
          className="p-1.5 md:p-2 rounded-full hover:bg-panel transition-colors text-muted hover:text-main"
          title="Toggle Theme"
        >
          {darkMode ? <Sun size={16} className="md:w-[18px] md:h-[18px]" /> : <Moon size={16} className="md:w-[18px] md:h-[18px]" />}
        </button>
        
        {/* Account Dropdown Container */}
        <div className="relative ml-1 md:ml-2" ref={profileRef}>
          <button 
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className={`w-7 h-7 md:w-8 md:h-8 rounded-full border flex items-center justify-center shadow-sm transition-colors ${
              isProfileOpen 
                ? 'bg-main border-white text-panel' 
                : 'bg-panel border-main text-main hover:border-white/50 shadow-white/5'
            }`}
            title="View Profile"
          >
            <User size={14} className="md:w-[18px] md:h-[18px]" />
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 top-full mt-3 w-56 bg-main border border-main rounded-xl shadow-2xl z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="p-3 border-b border-main bg-panel/30 rounded-t-xl mb-1">
                 <p className="text-[10px] font-bold text-muted uppercase tracking-tighter leading-none mb-1">Username</p>
                 <p className="text-sm font-bold text-main truncate">{name}</p>
              </div>
              <div className="p-1.5 flex flex-col gap-0.5">
                <button 
                  onClick={() => {
                    onProfileClick();
                    setIsProfileOpen(false);
                  }} 
                  className="w-full flex items-center justify-between p-2.5 rounded-lg transition-colors text-xs font-medium text-muted hover:text-main hover:bg-panel"
                >
                  <div className="flex items-center gap-2"><User size={14} /> See full portfolio</div>
                  <ChevronRight size={14} className="opacity-50" />
                </button>
                <button 
                  onClick={() => {
                    onLogout();
                    setIsProfileOpen(false);
                  }} 
                  className="w-full flex items-center gap-2 p-2.5 rounded-lg text-red-500 hover:bg-red-500/10 font-bold text-xs transition-colors"
                >
                  <LogOut size={14} /> Log Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}