import { Sun, Moon } from 'lucide-react';

interface GuestTopNavProps {
  darkMode: boolean;
  toggleDarkMode: () => void;
  onLogin: () => void;
  onSignUp: () => void;
  onGoHome: () => void;
}

export function GuestTopNav({ darkMode, toggleDarkMode, onLogin, onSignUp, onGoHome }: GuestTopNavProps) {
  return (
    <header className="h-12 md:h-14 border-b border-main bg-panel flex items-center justify-between px-4 md:px-6 sticky top-0 z-50 shrink-0 shadow-sm transition-colors font-sans">

      {/* Logo */}
      <button
        onClick={onGoHome}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity outline-none shrink-0"
      >
        <img src="assets/images/logo.webp" alt="NextBull Logo" className="h-6 md:h-8 w-auto" />
        <span className="font-semibold text-lg md:text-xl tracking-wide text-main hidden sm:block">
          NEXTBULL
        </span>
      </button>

      {/* Auth & Theme */}
      <div className="flex items-center gap-1 md:gap-2">
        <button
          onClick={toggleDarkMode}
          className="p-1.5 md:p-2 rounded-full hover:bg-main transition-colors text-muted hover:text-main"
          title="Toggle Theme"
        >
          {darkMode
            ? <Sun size={16} className="md:w-[18px] md:h-[18px]" />
            : <Moon size={16} className="md:w-[18px] md:h-[18px]" />
          }
        </button>

        <button
          onClick={onLogin}
          className="px-3 md:px-4 py-1.5 md:py-2 text-xs md:text-sm font-bold rounded-lg transition-all text-muted hover:text-main hover:bg-main"
        >
          Log In
        </button>

        <button
          onClick={onSignUp}
          className="px-3 md:px-5 py-1.5 md:py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs md:text-sm font-bold rounded-lg shadow-lg shadow-blue-600/30 transition-all active:scale-95"
        >
          Sign Up
        </button>
      </div>
    </header>
  );
}
