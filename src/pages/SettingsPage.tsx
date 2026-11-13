import React, { useState, useEffect } from 'react';
import {
  Database,
  Lock,
  Download,
  CheckCircle,
  AlertCircle,
  Play,
  Store,
  RefreshCw
} from 'lucide-react';
import { fetchApi, downloadFile } from '../lib/api';
import { reconcileAndSyncDatabase, pullAndCacheSnapshot } from '../lib/sync';
import { formatNumberFa } from '../lib/dateUtils';

interface SettingsPageProps {
  onRefreshData?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onRefreshData }) => {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [downloadingDb, setDownloadingDb] = useState(false);
  const [downloadingJson, setDownloadingJson] = useState(false);

  // Database health & sync state
  const [dbHealth, setDbHealth] = useState<{
    driver: 'turso' | 'sqlite';
    persistentCloud: boolean;
    revision: number;
    counts: Record<string, number>;
  } | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  const loadSettingsAndHealth = () => {
    Promise.allSettled([
      fetchApi<Record<string, string>>('/settings'),
      fetchApi<any>('/sync/health')
    ])
      .then(([setRes, healthRes]) => {
        if (setRes.status === 'fulfilled') setSettings(setRes.value);
        if (healthRes.status === 'fulfilled') setDbHealth(healthRes.value);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSettingsAndHealth();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetchApi('/settings', {
        method: 'POST',
        body: JSON.stringify(settings)
      });
      await pullAndCacheSnapshot();
      onRefreshData?.();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleFullSyncReconcile = async () => {
    setSyncLoading(true);
    setSyncMsg(null);
    try {
      const res = await reconcileAndSyncDatabase();
      setDbHealth(res.health);
      onRefreshData?.();
      setSyncMsg({
        type: 'success',
        text: `همگام‌سازی کامل و بازبینی ${formatNumberFa(res.stats.invoicesRecalculated)} فاکتور با موفقیت انجام شد (نسخه پایگاه‌داده: ${formatNumberFa(res.stats.revision)}).`
      });
    } catch (err: any) {
      setSyncMsg({ type: 'error', text: err?.message || 'خطا در همگام‌سازی پایگاه‌داده' });
    } finally {
      setSyncLoading(false);
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
      loadSettingsAndHealth();
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
      await pullAndCacheSnapshot();
      onRefreshData?.();
      setRestoreMsg(res.message);
      setRestoreJson('');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err: any) {
      setRestoreMsg(`خطا در بازیابی: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-white p-5 rounded-xl border border-slate-200">
        <h2 className="text-sm font-bold text-slate-900">تنظیمات فروشگاه، همگام‌سازی دیتابیس و پشتیبان‌گیری</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          مدیریت مشخصات فروشگاه، همگام‌سازی یکپارچه کل جداول دیتابیس، تهیه نسخه پشتیبان و اجرای آزمون‌های خودکار
        </p>
      </div>

      {/* Unified Database Sync & Health Card */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-600" />
            <div>
              <h3 className="text-xs font-bold text-slate-900">وضعیت پایگاه‌داده و همگام‌سازی یکپارچه</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                موتور فعال: {dbHealth?.driver === 'turso' ? 'پایگاه‌داده ابری Turso Cloud' : 'SQLite محلی + همگام‌سازی کامل مرورگر (IndexedDB)'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleFullSyncReconcile}
            disabled={syncLoading}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors shadow-xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncLoading ? 'animate-spin' : ''}`} />
            <span>{syncLoading ? 'در حال همگام‌سازی...' : 'همگام‌سازی و بازبینی یکپارچگی کل دیتابیس'}</span>
          </button>
        </div>

        {syncMsg && (
          <div className={`p-3 rounded-lg flex items-center gap-2 text-xs border ${
            syncMsg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}>
            {syncMsg.type === 'success' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{syncMsg.text}</span>
          </div>
        )}

        {dbHealth && (
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-center">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-base font-bold font-mono text-slate-900">{formatNumberFa(dbHealth.counts.customers || 0)}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">مشتریان</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-base font-bold font-mono text-slate-900">{formatNumberFa(dbHealth.counts.products || 0)}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">کالاها</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-base font-bold font-mono text-slate-900">{formatNumberFa(dbHealth.counts.invoices || 0)}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">فاکتورها</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-base font-bold font-mono text-slate-900">{formatNumberFa(dbHealth.counts.payments || 0)}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">پرداخت‌ها</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-base font-bold font-mono text-slate-900">{formatNumberFa(dbHealth.counts.expenses || 0)}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">هزینه‌ها</div>
            </div>
            <div className="p-3 bg-emerald-50/70 rounded-lg border border-emerald-200">
              <div className="text-base font-bold font-mono text-emerald-800">v{formatNumberFa(dbHealth.revision || 1)}</div>
              <div className="text-[11px] text-emerald-700 mt-0.5">نسخه سینک</div>
            </div>
          </div>
        )}
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
              disabled={loading}
              className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium shadow-xs disabled:opacity-50"
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
                  await downloadFile('/backup/download', dbHealth?.driver === 'turso' ? 'hesabyar_cloud_backup.json' : 'hesabyar.db');
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
            <span className="text-xs font-bold text-slate-900 block">۲. دانلود نسخه متنی کامل دیتابیس (JSON Dump)</span>
            <p className="text-[11px] text-slate-500">
              فایل JSON حاوی تمام جداول (مشتریان، کالاها، فاکتورها، پرداخت‌ها، اعتبارات، هزینه‌ها و تنظیمات).
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
              <h3 className="text-xs font-bold text-slate-900">آزمون‌های خودکار مالی، همگام‌سازی و صحت سیستم</h3>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              آزمون فروش، پرداخت مرحله‌ای، تخصیص چند فاکتور، اعتبار مشتری، استرداد وجه، همگام‌سازی کامل، اکسل، ورد، امنیت و پایداری
            </p>
          </div>
          <button
            onClick={handleRunTests}
            disabled={testsLoading}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors shadow-xs disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 text-emerald-400" />
            <span>{testsLoading ? 'در حال اجرای آزمون‌ها...' : 'اجرای زنده آزمون‌های خودکار'}</span>
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
