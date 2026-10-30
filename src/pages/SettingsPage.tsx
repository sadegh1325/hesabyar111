import React, { useState, useEffect } from 'react';
import {
  Settings,
  Database,
  Lock,
  Download,
  Upload,
  CheckCircle,
  AlertCircle,
  Play,
  Store,
  RefreshCw
} from 'lucide-react';
import { fetchApi, downloadFile } from '../lib/api';

export const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [downloadingDb, setDownloadingDb] = useState(false);
  const [downloadingJson, setDownloadingJson] = useState(false);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Test suite runner state
  const [testsLoading, setTestsLoading] = useState(false);
  const [testResults, setTestResults] = useState<Array<{ name: string; status: 'PASSED' | 'FAILED'; details: string }> | null>(null);

  // Restore state
  const [restoreJson, setRestoreJson] = useState('');
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);

  const loadSettings = () => {
    fetchApi<Record<string, string>>('/settings')
      .then(setSettings)
      .catch((err) => console.warn('Settings fetch warning:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetchApi('/settings', {
        method: 'POST',
        body: JSON.stringify(settings)
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'رمز عبور جدید و تکرار آن یکسان نیستند.' });
      return;
    }
    try {
      await fetchApi('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword })
      });
      setPasswordMsg({ type: 'success', text: 'رمز عبور با موفقیت تغییر یافت.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordMsg({ type: 'error', text: err.message });
    }
  };

  const handleRunTests = async () => {
    setTestsLoading(true);
    try {
      const res = await fetchApi<{ passed: boolean; results: any[] }>('/tests/run');
      setTestResults(res.results);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setTestsLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreJson.trim()) return;
    if (!confirm('آیا از بازیابی این داده‌ها اطمینان دارید؟ تمام داده‌های فعلی جایگزین خواهند شد.')) return;

    try {
      const parsed = JSON.parse(restoreJson);
      const res = await fetchApi<{ success: boolean; message: string }>('/backup/restore-json', {
        method: 'POST',
        body: JSON.stringify(parsed)
      });
      setRestoreMsg(res.message);
      setRestoreJson('');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      setRestoreMsg(`خطا در بازیابی: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-white p-5 rounded-xl border border-slate-200">
        <h2 className="text-sm font-bold text-slate-900">تنظیمات فروشگاه، امنیت و پشتیبان‌گیری</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          مدیریت مشخصات فروشگاه، سربرگ فاکتور، تهیه نسخه پشتیبان پایدار و اجرای آزمون‌های خودکار
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Store Settings Form */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Store className="w-4 h-4 text-emerald-600" />
            <h3 className="text-xs font-bold text-slate-900">مشخصات فروشگاه و چاپ فاکتور</h3>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-3 text-xs">
            {saveSuccess && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>تنظیمات فروشگاه با موفقیت ذخیره شد.</span>
              </div>
            )}

            <div>
              <label className="block text-slate-700 font-medium mb-1">نام فروشگاه:</label>
              <input
                type="text"
                value={settings['store_name'] || ''}
                onChange={(e) => setSettings({ ...settings, store_name: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-medium mb-1">شماره تماس فروشگاه:</label>
                <input
                  type="text"
                  value={settings['store_phone'] || ''}
                  onChange={(e) => setSettings({ ...settings, store_phone: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-medium mb-1">واحد پول رسمی:</label>
                <input
                  type="text"
                  disabled
                  value="تومان (ثابت)"
                  className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-500 cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">نشانی و آدرس فروشگاه:</label>
              <input
                type="text"
                value={settings['store_address'] || ''}
                onChange={(e) => setSettings({ ...settings, store_address: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">پیام بالای فاکتور (Header Note):</label>
              <input
                type="text"
                value={settings['invoice_header_note'] || ''}
                onChange={(e) => setSettings({ ...settings, invoice_header_note: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">پیام و شرایط پایین فاکتور (Footer Note):</label>
              <textarea
                rows={2}
                value={settings['invoice_footer_note'] || ''}
                onChange={(e) => setSettings({ ...settings, invoice_footer_note: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
              />
            </div>

            <button
              type="submit"
              className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium shadow-xs"
            >
              ذخیره تغییرات فروشگاه
            </button>
          </form>
        </div>

        {/* Change Password Form */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Lock className="w-4 h-4 text-emerald-600" />
            <h3 className="text-xs font-bold text-slate-900">تغییر رمز عبور ورود به سامانه</h3>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-3 text-xs">
            {passwordMsg && (
              <div className={`p-2.5 rounded-lg flex items-center gap-2 border ${
                passwordMsg.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}>
                {passwordMsg.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                <span>{passwordMsg.text}</span>
              </div>
            )}

            <div>
              <label className="block text-slate-700 font-medium mb-1">رمز عبور فعلی:</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">رمز عبور جدید (حداقل ۶ نویسه):</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">تکرار رمز عبور جدید:</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
              />
            </div>

            <button
              type="submit"
              className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium shadow-xs"
            >
              به‌روزرسانی رمز عبور
            </button>
          </form>
        </div>
      </div>

      {/* Backup and Restore Row */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-6">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <Database className="w-4 h-4 text-emerald-600" />
          <h3 className="text-xs font-bold text-slate-900">تهیه نسخه پشتیبان (Backup) و بازیابی اطلاعات (Restore)</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Download Binary SQLite DB */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <span className="text-xs font-bold text-slate-900 block">۱. دانلود فایل کامل دیتابیس (SQLite .db)</span>
            <p className="text-[11px] text-slate-500">
              یک فایل دیتابیس مستقل شامل کلیه جداول، تراکنش‌ها، ردیف‌ها و لاگ‌های سیستم با قابلیت استفاده مستقیم.
            </p>
            <button
              type="button"
              disabled={downloadingDb}
              onClick={async () => {
                setDownloadingDb(true);
                try {
                  await downloadFile('/backup/download', 'hesabyar.db');
                } catch (e: any) {
                  alert(e.message || 'خطا در دریافت فایل دیتابیس');
                } finally {
                  setDownloadingDb(false);
                }
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors shadow-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{downloadingDb ? 'در حال دریافت فایل...' : 'دانلود فایل hesabyar.db'}</span>
            </button>
          </div>

          {/* Download JSON Dump */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <span className="text-xs font-bold text-slate-900 block">۲. دانلود نسخه متنی دیتابیس (JSON Dump)</span>
            <p className="text-[11px] text-slate-500">
              فایل JSON حاوی تمام رکوردها جهت نگهداری متنی، انتقال آسان و بازیابی سریع در همین پنل.
            </p>
            <button
              type="button"
              disabled={downloadingJson}
              onClick={async () => {
                setDownloadingJson(true);
                try {
                  await downloadFile('/backup/json', 'hesabyar_backup.json');
                } catch (e: any) {
                  alert(e.message || 'خطا در دریافت فایل پشتیبان');
                } finally {
                  setDownloadingJson(false);
                }
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors shadow-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{downloadingJson ? 'در حال دریافت فایل...' : 'دانلود پشتیبان JSON'}</span>
            </button>
          </div>
        </div>

        {/* Restore section */}
        <div className="pt-4 border-t border-slate-200">
          <h4 className="text-xs font-bold text-slate-800 mb-2">بازیابی اطلاعات از فایل پشتیبان JSON:</h4>
          {restoreMsg && (
            <div className="mb-3 p-2.5 bg-slate-100 border border-slate-300 text-slate-800 text-xs rounded-lg">
              {restoreMsg}
            </div>
          )}
          <textarea
            rows={3}
            value={restoreJson}
            onChange={(e) => setRestoreJson(e.target.value)}
            placeholder="محتوای متنی فایل پشتیبان JSON را اینجا الصاق کنید..."
            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 mb-2"
          />
          <button
            type="button"
            disabled={!restoreJson.trim()}
            onClick={handleRestore}
            className="px-4 py-2 bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors shadow-xs"
          >
            بازیابی و جایگزینی اطلاعات دیتابیس
          </button>
        </div>
      </div>

      {/* Live Automated Test Suite Runner Card */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <RefreshCw className={`w-4 h-4 text-emerald-600 ${testsLoading ? 'animate-spin' : ''}`} />
              <h3 className="text-xs font-bold text-slate-900">آزمون‌های خودکار مالی و صحت سیستم (۱۰ آزمون استاندارد)</h3>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              آزمون فروش، پرداخت مرحله‌ای، تخصیص چند فاکتور، اعتبار مشتری، استرداد وجه، اکسل، ورد، امنیت، پایداری و بک‌آپ
            </p>
          </div>
          <button
            onClick={handleRunTests}
            disabled={testsLoading}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors shadow-xs disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 text-emerald-400" />
            <span>{testsLoading ? 'در حال اجرای آزمون‌ها...' : 'اجرای زنده آزمون‌های ۱۰گانه'}</span>
          </button>
        </div>

        {testResults && (
          <div className="space-y-2 pt-2">
            <div className="text-xs font-bold text-slate-800 mb-1">
              نتیجه اجرای آزمون‌ها ({testResults.filter(r => r.status === 'PASSED').length} از {testResults.length} موفق):
            </div>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
              {testResults.map((r, idx) => (
                <div key={idx} className="p-3 bg-slate-50/50 flex items-start gap-2.5 text-xs">
                  <span className={r.status === 'PASSED' ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                    {r.status === 'PASSED' ? '✅' : '❌'}
                  </span>
                  <div>
                    <span className="font-semibold text-slate-900 block">{r.name}</span>
                    <span className="text-[11px] text-slate-500 mt-0.5 block">{r.details}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
