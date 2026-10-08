import React from 'react';
import { ArrowRight, Zap, BarChart2, Shield, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { GuestTopNav } from '../layouts/GuestTopNav';
import { useAuth } from '../../hooks/useAuth';

interface LandingPageProps {
  darkMode: boolean;
  toggleDarkMode: () => void;
  onLoginClick?: () => void;
  onSignUpClick?: () => void;
}

const features = [
  {
    icon: <Zap size={20} />,
    title: 'Real-Time Order Execution',
    description:
      'Sub-10ms order matching with live Level-2 order book depth, tick-by-tick price feeds, and instant position confirmation.',
  },
  {
    icon: <BarChart2 size={20} />,
    title: 'Advanced Charting',
    description:
      'Professional charts with candlestick and line views across multiple timeframes — with live price overlays built in.',
  },
  {
    icon: <Shield size={20} />,
    title: 'Portfolio Analytics',
    description:
      'Deep portfolio insights with unrealised P&L tracking, exposure analysis, and weighted performance breakdowns.',
  },
];

const stats = [
  { label: 'Execution Latency', value: '<10ms' },
  { label: 'Markets Available', value: '10+' },
  { label: 'Platform Uptime', value: '99.9%' },
  { label: 'Simulated Volume', value: '₹2.4Cr' },
];

export const LandingPage: React.FC<LandingPageProps> = ({ darkMode, toggleDarkMode }) => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const handleStartTrading = () => {
    navigate(isAuthenticated ? '/app/trade' : '/login');
  };

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors duration-500 relative font-sans ${
        darkMode ? 'bg-black text-white' : 'bg-slate-50 text-slate-900'
      }`}
    >
      {/* ─── BACKGROUND ─── */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        {/* Subtle grid */}
        <div
          className={`absolute inset-0 ${darkMode ? 'opacity-[0.05]' : 'opacity-[0.04]'}`}
          style={{
            backgroundImage: `linear-gradient(${darkMode ? '#1e293b' : '#cbd5e1'} 1px, transparent 1px),
                              linear-gradient(90deg, ${darkMode ? '#1e293b' : '#cbd5e1'} 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />
        {/* Top-center blue radial glow */}
        <div
          className={`absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full blur-[160px] ${
            darkMode ? 'bg-blue-600/10' : 'bg-blue-300/15'
          }`}
        />
      </div>

      {/* ─── NAV ─── */}
      <GuestTopNav
        darkMode={darkMode}
        onLogin={() => navigate('/login')}
        onSignUp={() => navigate('/signup')}
        toggleDarkMode={toggleDarkMode}
        onGoHome={() => navigate('/')}
      />

      {/* ─── HERO ─── */}
      <main className="flex-1 flex flex-col items-center pt-20 pb-0 px-6 text-center relative z-10">

        {/* Live Badge */}
        <div
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-widest mb-8 border ${
            darkMode
              ? 'bg-blue-600/10 border-blue-500/20 text-blue-400'
              : 'bg-blue-50 border-blue-200 text-blue-600'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          Live Markets Active
        </div>

        {/* Headline */}
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-black mb-6 tracking-tighter leading-[0.9] max-w-4xl">
          Trade Smarter.{' '}
          <span
            className={`text-transparent bg-clip-text ${
              darkMode
                ? 'bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-500'
                : 'bg-gradient-to-r from-blue-600 to-cyan-500'
            }`}
          >
            Move Faster.
          </span>
        </h1>

        {/* Subtext */}
        <p
          className={`max-w-2xl mx-auto mb-10 text-base md:text-lg font-medium leading-relaxed ${
            darkMode ? 'text-slate-400' : 'text-slate-600'
          }`}
        >
          NEXTBULL is a professional algorithmic trading simulator with real-time order execution,
          advanced charting, and deep portfolio analytics — built for serious traders.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 mb-16">
          <button
            onClick={handleStartTrading}
            className="group flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-xl text-sm font-black uppercase tracking-widest shadow-xl shadow-blue-600/25 transition-all active:scale-95"
          >
            {isAuthenticated ? 'Go to Dashboard' : 'Start Trading Now'}
            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </button>

          {!isAuthenticated && (
            <button
              onClick={() => navigate('/signup')}
              className={`flex items-center gap-2 px-8 py-4 rounded-xl text-sm font-bold border transition-all active:scale-95 ${
                darkMode
                  ? 'border-white/10 text-slate-300 hover:bg-white/5 hover:border-white/20'
                  : 'border-slate-200 text-slate-600 hover:bg-white hover:border-slate-300 shadow-sm'
              }`}
            >
              Create Free Account
              <ChevronRight size={16} />
            </button>
          )}
        </div>

        {/* ─── STATS BAR ─── */}
        <div
          className={`flex flex-wrap items-center justify-center gap-x-10 gap-y-6 mb-16 pb-10 border-b w-full max-w-3xl ${
            darkMode ? 'border-white/5' : 'border-slate-200'
          }`}
        >
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col items-center gap-0.5">
              <div
                className={`text-2xl font-black font-mono tracking-tight ${
                  darkMode ? 'text-white' : 'text-slate-900'
                }`}
              >
                {s.value}
              </div>
              <div
                className={`text-[10px] uppercase tracking-widest font-bold ${
                  darkMode ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* ─── DASHBOARD PREVIEW ─── */}
        <div
          className={`w-full max-w-[1200px] rounded-t-2xl border border-b-0 relative overflow-hidden transition-all duration-500 ${
            darkMode
              ? 'border-white/10 shadow-[0_-20px_80px_-10px_rgba(59,130,246,0.12)]'
              : 'border-slate-200 shadow-[0_-20px_60px_-10px_rgba(15,23,42,0.08)]'
          }`}
        >
          {/* Browser chrome bar */}
          <div
            className={`h-9 flex items-center px-4 gap-3 border-b shrink-0 ${
              darkMode ? 'bg-[#0a0a0a] border-white/10' : 'bg-slate-100 border-slate-200'
            }`}
          >
            <div className="flex gap-1.5 shrink-0">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400/90" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400/90" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-400/90" />
            </div>
            <div
              className={`flex-1 max-w-xs mx-auto h-5 rounded-md flex items-center justify-center text-[10px] font-mono ${
                darkMode
                  ? 'bg-white/5 text-slate-500'
                  : 'bg-white border border-slate-200 text-slate-400'
              }`}
            >
              app.nextbull.in/trade
            </div>
          </div>

          {/* Dashboard screenshot */}
          <div className="relative">
            <img
              src="/assets/images/Dashboard.png"
              alt="NEXTBULL Trading Dashboard"
              className="w-full object-cover object-top"
            />
            {/* Bottom fade-out gradient */}
            <div
              className="absolute bottom-0 left-0 right-0 h-2/3 pointer-events-none"
              style={{
                background: `linear-gradient(to top, ${
                  darkMode ? '#000000' : '#f8fafc'
                } 0%, transparent 100%)`,
              }}
            />
          </div>
        </div>
      </main>

      {/* ─── FEATURES SECTION ─── */}
      <section
        className={`relative z-10 px-6 py-24 ${darkMode ? 'bg-black' : 'bg-slate-50'}`}
      >
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p
              className={`text-[11px] font-black uppercase tracking-[0.25em] mb-3 ${
                darkMode ? 'text-blue-400' : 'text-blue-600'
              }`}
            >
              Built for professionals
            </p>
            <h2
              className={`text-3xl md:text-4xl font-black tracking-tight ${
                darkMode ? 'text-white' : 'text-slate-900'
              }`}
            >
              Everything you need to trade
            </h2>
            <p
              className={`mt-3 text-sm max-w-xl mx-auto ${
                darkMode ? 'text-slate-500' : 'text-slate-500'
              }`}
            >
              A full-stack trading terminal with institutional-grade tooling, accessible to every trader.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {features.map((f) => (
              <div
                key={f.title}
                className={`p-6 rounded-2xl border transition-all duration-300 hover:-translate-y-0.5 ${
                  darkMode
                    ? 'bg-white/[0.03] border-white/[0.07] hover:border-white/[0.12] hover:bg-white/[0.05]'
                    : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-md'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${
                    darkMode ? 'bg-blue-600/15 text-blue-400' : 'bg-blue-50 text-blue-600'
                  }`}
                >
                  {f.icon}
                </div>
                <h3
                  className={`font-black text-sm mb-2 ${
                    darkMode ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  {f.title}
                </h3>
                <p className={`text-sm leading-relaxed ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── BOTTOM CTA ─── */}
      <section
        className={`relative z-10 px-6 pb-20 pt-0 ${darkMode ? 'bg-black' : 'bg-slate-50'}`}
      >
        <div
          className={`max-w-2xl mx-auto py-14 px-8 rounded-3xl border text-center relative overflow-hidden ${
            darkMode
              ? 'bg-gradient-to-br from-blue-950/40 to-black border-blue-500/20'
              : 'bg-gradient-to-br from-blue-50 to-slate-50 border-blue-100'
          }`}
        >
          {darkMode && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-40 bg-blue-600/10 rounded-full blur-3xl" />
            </div>
          )}

          <p
            className={`text-[11px] font-black uppercase tracking-[0.25em] mb-3 relative z-10 ${
              darkMode ? 'text-blue-400' : 'text-blue-600'
            }`}
          >
            Get started today
          </p>
          <h2
            className={`text-2xl md:text-3xl font-black tracking-tight mb-3 relative z-10 ${
              darkMode ? 'text-white' : 'text-slate-900'
            }`}
          >
            Ready to take your edge?
          </h2>
          <p
            className={`text-sm mb-8 relative z-10 ${
              darkMode ? 'text-slate-400' : 'text-slate-600'
            }`}
          >
            Join the platform built for precision trading. No risk, pure simulation.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 relative z-10">
            <button
              onClick={handleStartTrading}
              className="group inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-10 py-4 rounded-xl text-sm font-black uppercase tracking-widest shadow-xl shadow-blue-600/25 transition-all active:scale-95"
            >
              {isAuthenticated ? 'Go to Dashboard' : 'Start Trading for Free'}
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </button>

            {!isAuthenticated && (
              <button
                onClick={() => navigate('/login')}
                className={`inline-flex items-center gap-2 px-6 py-4 rounded-xl text-sm font-bold border transition-all active:scale-95 ${
                  darkMode
                    ? 'border-white/10 text-slate-300 hover:bg-white/5 hover:border-white/20'
                    : 'border-slate-200 text-slate-600 hover:bg-white shadow-sm'
                }`}
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
