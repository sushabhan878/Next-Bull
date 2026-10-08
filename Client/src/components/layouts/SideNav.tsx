// 1. Added Star to the lucide-react imports
import { LineChart, BarChart2, PieChart, History, Activity, Menu, LogOut, Star } from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';

interface SideNavProps {
  onLogout: () => void;
  isMobileOpen?: boolean;
  closeMobileNav?: () => void;
}

export function SideNav({ onLogout, isMobileOpen, closeMobileNav }: SideNavProps) {
  const [expanded, setExpanded] = useState(false);

  // 2. Added the Watchlist object to the navItems array
  const navItems = [
    { icon: <Activity size={20} />, label: 'Trade', path: '/app/trade' },
    { icon: <BarChart2 size={20} />, label: 'Markets', path: '/app/markets' },
    { icon: <Star size={20} />, label: 'Watchlist', path: '/app/watchlist' }, // <-- NEW
    { icon: <PieChart size={20} />, label: 'Portfolio', path: '/app/portfolio' },
    { icon: <History size={20} />, label: 'History', path: '/app/history' },
  ];

  return (
    <>
      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm" 
          onClick={closeMobileNav}
        />
      )}
      <aside className={`
        ${expanded ? 'w-48' : 'w-16'} 
        fixed inset-y-0 left-0 z-50 md:relative md:z-20
        flex flex-col items-center py-3 border-r border-main bg-panel shrink-0 
        transition-all duration-300 ease-in-out font-sans
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
      <div className={`flex items-center mb-6 transition-all ${expanded ? 'w-full px-3' : 'justify-center w-full'}`}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-2 rounded-lg hover:bg-main transition-colors text-muted hover:text-main"
          title={expanded ? "Collapse menu" : "Expand menu"}
        >
          <Menu size={20} />
        </button>
        {expanded && <span className="ml-2 text-muted font-medium text-xs uppercase tracking-wider">Menu</span>}
      </div>

      <nav className={`flex flex-col gap-3 w-full ${expanded ? 'px-3' : 'px-2'}`}>
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={() => { if (closeMobileNav) closeMobileNav(); }}
            title={expanded ? '' : item.label}
            className={({ isActive }) => `
              h-10 flex items-center rounded-xl transition-all duration-200 group relative
              ${expanded ? 'px-3 justify-start gap-3 w-full' : 'w-10 justify-center mx-auto'}
              ${isActive
                ? 'bg-panel border border-white/20 text-main shadow-sm'
                : 'text-muted hover:bg-panel hover:text-main border border-transparent'
              }
            `}
          >
            {({ isActive }) => (
              <>
                <div className={`transition-transform duration-200 ${isActive ? '' : 'group-hover:scale-110 shrink-0'}`}>
                  {item.icon}
                </div>
                {expanded && <span className="font-medium text-sm whitespace-nowrap overflow-hidden">{item.label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className={`mt-auto w-full flex flex-col gap-2 ${expanded ? 'px-3' : 'px-2'}`}>
        <button 
          onClick={onLogout}
          title={expanded ? '' : 'Log Out'}
          className={`h-10 flex items-center rounded-xl transition-all duration-300 group
              ${expanded ? 'px-3 justify-start gap-3 w-full' : 'w-10 justify-center mx-auto'}
              text-red-500/70 hover:text-red-500 hover:bg-red-500/10
        `}>
          <div className="shrink-0 transition-transform"><LogOut size={20} /></div>
          {expanded && <span className="font-medium text-sm whitespace-nowrap overflow-hidden">Log Out</span>}
        </button>
      </div>
      </aside>
    </>
  );
}