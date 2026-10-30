import React, { useState } from 'react';
import { Download, CheckCircle2, Smartphone, Share2, PlusSquare, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton({ className = '' }: { className?: string }) {
  const { isInstallable, isInstalled, isIOS, installApp } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [installing, setInstalling] = useState(false);

  // If already installed as standalone PWA
  if (isInstalled) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg ${className}`}>
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
        <span>وب‌اپلیکیشن فعال</span>
      </div>
    );
  }

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSModal(true);
      return;
    }

    if (isInstallable) {
      setInstalling(true);
      try {
        await installApp();
      } finally {
        setInstalling(false);
      }
    } else {
      // In case beforeinstallprompt hasn't fired yet or browser doesn't support automatic prompt
      setShowIOSModal(true);
    }
  };

  return (
    <>
      <button
        onClick={handleInstallClick}
        disabled={installing}
        title="نصب حساب‌یار روی گوشی یا رایانه"
        className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-all shadow-xs cursor-pointer active:scale-95 ${className}`}
      >
        <Download className="w-4 h-4 text-blue-600 animate-pulse" />
        <span>نصب نسخه وب‌اپ (PWA)</span>
      </button>

      {/* Guide modal for iOS and manual installation */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-md p-6 bg-white rounded-2xl shadow-2xl border border-slate-100 rtl text-right">
            <button
              onClick={() => setShowIOSModal(false)}
              className="absolute top-4 left-4 p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-blue-100 text-blue-700 rounded-xl">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">نصب حساب‌یار روی دستگاه</h3>
                <p className="text-xs text-slate-500">دسترسی سریع و بدون نیاز به دانلود از بازار/گوگل‌پلی</p>
              </div>
            </div>

            <div className="space-y-3.5 text-xs text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-200 mb-5">
              <div className="font-semibold text-slate-800 border-b border-slate-200 pb-2">
                راهنمای نصب در مرورگر (آیفون / سافاری / کروم):
              </div>
              <div className="flex items-start gap-2.5">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold shrink-0">۱</span>
                <span>در نوار پایین یا بالای مرورگر دکمه <strong className="text-slate-900 inline-flex items-center gap-1 font-semibold mx-1"><Share2 className="w-3.5 h-3.5" /> Share</strong> یا علامت سه نقطه را بزنید.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold shrink-0">۲</span>
                <span>گزینه <strong className="text-slate-900 inline-flex items-center gap-1 font-semibold mx-1"><PlusSquare className="w-3.5 h-3.5" /> افزودن به صفحه اصلی (Add to Home Screen)</strong> را انتخاب کنید.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold shrink-0">۳</span>
                <span>دکمه <strong>Add (افزودن)</strong> را لمس کنید تا آیکون برنامه در کنار بقیه برنامه‌های گوشی شما قرار گیرد.</span>
              </div>
            </div>

            <button
              onClick={() => setShowIOSModal(false)}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-xl transition-colors shadow-sm"
            >
              متوجه شدم
            </button>
          </div>
        </div>
      )}
    </>
  );
}
