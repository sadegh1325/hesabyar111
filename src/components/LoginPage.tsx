import React, { useState } from 'react';
import { Store, Lock, User, AlertCircle, ArrowLeft } from 'lucide-react';
import { fetchApi, setAuthToken } from '../lib/api';

interface LoginPageProps {
  onLoginSuccess: (user: { id: number; username: string; fullName: string }) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetchApi<{
        success: boolean;
        token: string;
        user: { id: number; username: string; fullName: string };
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

      if (res.token) {
        setAuthToken(res.token);
      }
      try {
        localStorage.removeItem('hesabyar_manual_logout');
      } catch {}

      onLoginSuccess(res.user);
    } catch (err: any) {
      setError(err.message || 'نام کاربری یا کلمه عبور نادرست است.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 text-white p-8 text-center">
          <div className="w-12 h-12 bg-emerald-600 rounded-xl mx-auto flex items-center justify-center mb-3 shadow-sm">
            <Store className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold">سامانه حساب‌یار فروشگاه</h1>
          <p className="text-xs text-slate-400 mt-1">ورود به دفتر مدیریت فروش و حساب مشتریان</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">نام کاربری:</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="نام کاربری"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pr-9 pl-3 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">رمز عبور:</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="رمز عبور"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pr-9 pl-3 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-xs disabled:opacity-50"
          >
            <span>{loading ? 'در حال ورود...' : 'ورود امن به سامانه'}</span>
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* Quick login hint */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-500 space-y-1 mt-4">
            <span className="font-semibold text-slate-700 block">مشخصات پیش‌فرض مدیر سامانه:</span>
            <div className="flex justify-between font-mono">
              <span>نام کاربری: admin</span>
              <span>رمز عبور: admin123</span>
            </div>
            <span className="text-slate-400 block text-[10px] mt-1">
              (پس از اولین ورود، در بخش تنظیمات رمز خود را تغییر دهید)
            </span>
          </div>
        </form>
      </div>
    </div>
  );
};
