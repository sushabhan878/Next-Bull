import { useState } from 'react';
import { Eye, EyeOff, ArrowRight, Lock, Mail, User, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { GuestTopNav } from '../layouts/GuestTopNav';
import { useAuth } from '../../hooks/useAuth';
import { API_BASE_URL } from '../../config';

interface SignUpPageProps {
  darkMode: boolean;
  toggleDarkMode: () => void;
  onGoToLogin?: () => void;
  onGoToHome?: () => void;
}

export function SignUpPage({ darkMode, toggleDarkMode }: SignUpPageProps) {
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
    const fullName = formData.get('fullName') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const confirmPassword = (formData.get('confirmPassword') as string || '').trim();

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setIsLoading(false);
      return;
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(password)) {
      setError("Password must be at least 8 characters, include a lowercase letter and a number.");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          email,
          password
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      login(data.access_token, data.refresh_token, {
        id: 0,
        email: email,
        fullName: fullName
      });

      navigate('/app/trade');
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass = (dark: boolean) =>
    `w-full rounded-xl py-3 pl-10 pr-4 text-sm outline-none border transition-all focus:ring-2 ${
      dark
        ? 'bg-white/5 border-white/8 text-white placeholder-white/20 focus:border-blue-500/50 focus:ring-blue-500/10'
        : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-400 focus:ring-blue-400/10'
    }`;

  const labelClass = (dark: boolean) =>
    `block text-[10px] font-black uppercase tracking-[0.2em] ${
      dark ? 'text-slate-500' : 'text-slate-400'
    }`;

  const iconColor = darkMode ? 'rgba(255,255,255,0.3)' : '#94a3b8';

  return (
    <div
      className={`min-h-screen w-full flex flex-col font-sans transition-colors duration-500 ${
        darkMode ? 'bg-black text-white' : 'bg-slate-50 text-slate-900'
      }`}
    >
      {/* ─── NAV ─── */}
      <GuestTopNav
        darkMode={darkMode}
        toggleDarkMode={toggleDarkMode}
        onLogin={() => navigate('/login')}
        onSignUp={() => {}}
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
        <div className="relative z-10 w-full max-w-[440px]">

          {/* Header above card */}
          <div className="text-center mb-8">
            <p className={`text-[11px] font-black uppercase tracking-[0.25em] ${
              darkMode ? 'text-blue-400' : 'text-blue-600'
            }`}>
              New Account
            </p>
            <h1 className={`text-2xl font-black tracking-tight mt-1 ${
              darkMode ? 'text-white' : 'text-slate-900'
            }`}>
              Join NEXTBULL
            </h1>
            <p className={`text-sm mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
              Set up your trading account in seconds.
            </p>
          </div>

          <div
            className={`rounded-2xl border p-8 shadow-2xl transition-all duration-500 ${
              darkMode
                ? 'bg-white/[0.03] border-white/[0.08] shadow-black/60'
                : 'bg-white border-slate-200 shadow-slate-200/60'
            }`}
          >
            <form className="space-y-4" onSubmit={handleFormSubmit}>

              {/* FULL NAME */}
              <div className="space-y-1.5">
                <label className={labelClass(darkMode)}>Full Name</label>
                <div className="relative group">
                  <User
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-blue-500"
                    size={16}
                    style={{ color: iconColor }}
                  />
                  <input
                    name="fullName"
                    type="text"
                    placeholder="Alex Morgan"
                    required
                    className={inputClass(darkMode)}
                  />
                </div>
              </div>

              {/* EMAIL */}
              <div className="space-y-1.5">
                <label className={labelClass(darkMode)}>Email Address</label>
                <div className="relative group">
                  <Mail
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-blue-500"
                    size={16}
                    style={{ color: iconColor }}
                  />
                  <input
                    name="email"
                    type="email"
                    placeholder="trader@nextbull.in"
                    required
                    className={inputClass(darkMode)}
                  />
                </div>
              </div>

              {/* PASSWORDS */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className={labelClass(darkMode)}>Password</label>
                  <div className="relative group">
                    <Lock
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-blue-500"
                      size={14}
                      style={{ color: iconColor }}
                    />
                    <input
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      required
                      className={`w-full rounded-xl py-3 pl-9 pr-4 text-sm outline-none border transition-all focus:ring-2 ${
                        darkMode
                          ? 'bg-white/5 border-white/8 text-white placeholder-white/20 focus:border-blue-500/50 focus:ring-blue-500/10'
                          : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-400 focus:ring-blue-400/10'
                      }`}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className={labelClass(darkMode)}>Confirm</label>
                  <div className="relative group">
                    <Lock
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-blue-500"
                      size={14}
                      style={{ color: iconColor }}
                    />
                    <input
                      name="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      required
                      className={`w-full rounded-xl py-3 pl-9 pr-4 text-sm outline-none border transition-all focus:ring-2 ${
                        darkMode
                          ? 'bg-white/5 border-white/8 text-white placeholder-white/20 focus:border-blue-500/50 focus:ring-blue-500/10'
                          : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-400 focus:ring-blue-400/10'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* SHOW/HIDE TOGGLE */}
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors hover:text-blue-500 ${
                  darkMode ? 'text-slate-600' : 'text-slate-400'
                }`}
              >
                {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                {showPassword ? 'Hide passwords' : 'Show passwords'}
              </button>

              {/* TERMS NOTE */}
              <div
                className={`flex items-start gap-3 p-3 rounded-xl border ${
                  darkMode
                    ? 'bg-blue-500/5 border-blue-500/10'
                    : 'bg-slate-50 border-slate-100'
                }`}
              >
                <ShieldCheck className="text-blue-500 shrink-0 mt-0.5" size={14} />
                <p className={`text-[10px] leading-relaxed ${
                  darkMode ? 'text-slate-500' : 'text-slate-500'
                }`}>
                  By creating an account you agree to our <b>Institutional Protocol</b> and simulation risk terms.
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
                className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-black uppercase tracking-widest shadow-lg shadow-blue-600/20 transition-all active:scale-[0.98] group mt-1 ${
                  isLoading
                    ? 'bg-blue-800 cursor-not-allowed text-blue-300'
                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                }`}
              >
                {isLoading ? 'Creating Account...' : 'Create Account'}
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
                Already have an account?{' '}
                <button
                  onClick={() => navigate('/login')}
                  className="font-black text-blue-500 hover:text-blue-400 transition-colors"
                >
                  Sign in
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
