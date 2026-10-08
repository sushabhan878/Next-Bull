import { useState } from 'react';
import { Eye, EyeOff, ArrowRight, Lock, Mail, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { GuestTopNav } from '../layouts/GuestTopNav';
import { useAuth } from '../../hooks/useAuth';
import { API_BASE_URL } from '../../config';

interface LoginPageProps {
  darkMode: boolean;
  toggleDarkMode: () => void;
  onGoToSignUp?: () => void;
  onGoToHome?: () => void;
}

export function LoginPage({ darkMode, toggleDarkMode }: LoginPageProps) {
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    const passwordRegex = /^(?=.*[a-z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(password)) {
      setError("Password must be at least 8 characters, include a lowercase letter and a number.");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      login(data.access_token, data.refresh_token, {
        id: 0,
        email: email,
        fullName: 'Operator'
      });

      navigate('/app/trade');
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col font-sans transition-colors duration-500 bg-main text-main">
      
      {/* ─── SHARED TOP NAVIGATION ─── */}
      <GuestTopNav 
        darkMode={darkMode}
        toggleDarkMode={toggleDarkMode}
        onLogin={() => {}}
        onSignUp={() => navigate('/signup')}
        onGoHome={() => navigate('/')}
      />

      <div className="flex-1 w-full flex items-center justify-center relative overflow-hidden px-4 py-12">

        {/* ─── BACKGROUND ─── */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className={`absolute inset-0 ${darkMode ? 'opacity-[0.05]' : 'opacity-[0.04]'}`}
            style={{
              backgroundImage: `linear-gradient(${darkMode ? '#1e293b' : '#cbd5e1'} 1px, transparent 1px),
                                linear-gradient(90deg, ${darkMode ? '#1e293b' : '#cbd5e1'} 1px, transparent 1px)`,
              backgroundSize: '60px 60px',
            }}
          />
          <div
            className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] rounded-full blur-[140px] ${
              darkMode ? 'bg-blue-600/8' : 'bg-blue-300/15'
            }`}
          />
        </div>

        {/* ─── CARD ─── */}
        <div className="relative z-10 w-full max-w-[400px]">

          {/* Logo lockup above card */}
          <div className="text-center mb-8">
            <p className={`text-[11px] font-black uppercase tracking-[0.25em] ${
              darkMode ? 'text-blue-400' : 'text-blue-600'
            }`}>
              Operator Authentication
            </p>
            <h1 className={`text-2xl font-black tracking-tight mt-1 ${
              darkMode ? 'text-white' : 'text-slate-900'
            }`}>
              Welcome back
            </h1>
            <p className={`text-sm mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
              Sign in to access your trading terminal.
            </p>
          </div>

          <div
            className={`rounded-2xl border p-8 shadow-2xl transition-all duration-500 ${
              darkMode
                ? 'bg-white/[0.03] border-white/[0.08] shadow-black/60'
                : 'bg-white border-slate-200 shadow-slate-200/60'
            }`}
          >
            <form className="space-y-5" onSubmit={handleFormSubmit}>

              {/* EMAIL */}
              <div className="space-y-1.5">
                <label className={`block text-[10px] font-black uppercase tracking-[0.2em] ${
                  darkMode ? 'text-slate-500' : 'text-slate-400'
                }`}>
                  Email Address
                </label>
                <div className="relative group">
                  <Mail
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-blue-500"
                    size={16}
                    style={{ color: darkMode ? 'rgba(255,255,255,0.3)' : '#94a3b8' }}
                  />
                  <input
                    name="email"
                    type="email"
                    placeholder="trader@nextbull.in"
                    required
                    className={`w-full rounded-xl py-3 pl-10 pr-4 text-sm outline-none border transition-all focus:ring-2 ${
                      darkMode
                        ? 'bg-white/5 border-white/8 text-white placeholder-white/20 focus:border-blue-500/50 focus:ring-blue-500/10'
                        : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-400 focus:ring-blue-400/10'
                    }`}
                  />
                </div>
              </div>

              {/* PASSWORD */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className={`text-[10px] font-black uppercase tracking-[0.2em] ${
                    darkMode ? 'text-slate-500' : 'text-slate-400'
                  }`}>
                    Password
                  </label>
                  <button
                    type="button"
                    className={`text-[10px] font-bold hover:text-blue-500 transition-colors ${
                      darkMode ? 'text-slate-600' : 'text-slate-400'
                    }`}
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative group">
                  <Lock
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-blue-500"
                    size={16}
                    style={{ color: darkMode ? 'rgba(255,255,255,0.3)' : '#94a3b8' }}
                  />
                  <input
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    required
                    className={`w-full rounded-xl py-3 pl-10 pr-11 text-sm outline-none border transition-all focus:ring-2 ${
                      darkMode
                        ? 'bg-white/5 border-white/8 text-white placeholder-white/20 focus:border-blue-500/50 focus:ring-blue-500/10'
                        : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-400 focus:ring-blue-400/10'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className={`absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors hover:text-blue-500 ${
                      darkMode ? 'text-slate-600' : 'text-slate-400'
                    }`}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* SECURITY NOTE */}
              <div
                className={`flex items-start gap-3 p-3 rounded-xl border ${
                  darkMode
                    ? 'bg-amber-500/5 border-amber-500/10'
                    : 'bg-amber-50 border-amber-100'
                }`}
              >
                <ShieldAlert className="text-amber-500 shrink-0 mt-0.5" size={14} />
                <p className={`text-[10px] leading-relaxed ${
                  darkMode ? 'text-amber-500/70' : 'text-amber-700/80'
                }`}>
                  Verify you are on the official <b>nextbull.in</b> domain before entering credentials.
                </p>
              </div>

              {/* ERROR */}
              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-bold uppercase tracking-wider animate-in fade-in slide-in-from-top-1">
                  {error}
                </div>
              )}

              {/* SUBMIT */}
              <button
                type="submit"
                disabled={isLoading}
                className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-black uppercase tracking-widest shadow-lg shadow-blue-600/20 transition-all active:scale-[0.98] group mt-2 ${
                  isLoading
                    ? 'bg-blue-800 cursor-not-allowed text-blue-300'
                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                }`}
              >
                {isLoading ? 'Authenticating...' : 'Sign In'}
                {!isLoading && (
                  <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                )}
              </button>
            </form>

            {/* FOOTER */}
            <div
              className={`mt-6 pt-5 border-t text-center ${
                darkMode ? 'border-white/5' : 'border-slate-100'
              }`}
            >
              <p className={`text-[11px] ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                Don't have an account?{' '}
                <button
                  onClick={() => navigate('/signup')}
                  className="font-black text-blue-500 hover:text-blue-400 transition-colors"
                >
                  Create one
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
