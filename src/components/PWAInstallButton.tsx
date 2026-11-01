import React, { useState } from 'react';
import { Download, CheckCircle2, Smartphone, Share2, PlusSquare, X, ArrowDownToLine, Sparkles } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'compact' | 'full' | 'sidebar' | 'login';
}

export function PWAInstallButton({ className = '', variant = 'compact' }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, installApp } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);
  const [installing, setInstalling] = useState(false);

  // If already running inside standalone installed PWA
  if (isInstalled) {
    if (variant === 'sidebar') {
      return (
        <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <div>
            <span className="font-bold block">برنامه نصب شده است</span>
            <span className="text-[10px] text-emerald-600 block">نسخه وب‌اپ پیش‌رونده فعال</span>
          </div>
        </div>
      );
    }
    return (
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg ${className}`}>
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        <span className="hidden sm:inline">نصب‌شده</span>
      </div>
    );
  }

  const handleInstallClick = async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }

    if (isInstallable) {
      setInstalling(true);
      try {
        const success = await installApp();
        if (!success) {
          setShowModal(true);
        }
      } catch {
        setShowModal(true);
      } finally {
        setInstalling(false);
      }
    } else {
      setShowModal(true);
    }
  };

  return (
    <>
      {variant === 'sidebar' ? (
        <div className="p-3.5 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl space-y-2.5 shadow-xs">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-xs text-slate-900 block leading-tight">
                نصب اپلیکیشن روی گوشی
              </span>
              <span className="text-[10px] text-slate-500 font-medium block">
                استفاده تمام‌صفحه مانند نرم‌افزار محلی
              </span>
            </div>
          </div>
          <button
            onClick={handleInstallClick}
            disabled={installing}
            className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:scale-98"
          >
            <Download className="w-3.5 h-3.5" />
            <span>نصب مستقیم روی گوشی</span>
          </button>
        </div>
      ) : variant === 'login' ? (
        <button
          type="button"
          onClick={handleInstallClick}
          disabled={installing}
          className="w-full py-2.5 px-4 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs active:scale-98"
        >
          <Smartphone className="w-4 h-4 text-blue-600" />
          <span>نصب اپلیکیشن حساب‌یار روی گوشی (PWA)</span>
        </button>
      ) : (
        <button
          onClick={handleInstallClick}
          disabled={installing}
          title="نصب اپلیکیشن روی گوشی یا رایانه"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-all shadow-xs cursor-pointer active:scale-95 ${className}`}
        >
          <ArrowDownToLine className="w-3.5 h-3.5 text-blue-600 animate-bounce" />
          <span className="hidden xs:inline">نصب نسخه گوشی</span>
          <span className="xs:hidden">نصب</span>
        </button>
      )}

      {/* Installation Guide Modal (for iOS Safari, Android Chrome, and all browsers) */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-right">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-base leading-tight">نصب اپلیکیشن روی گوشی</h3>
                  <p className="text-[11px] text-blue-100 mt-0.5">بدون نیاز به کافه‌بازار یا گوگل‌پلی (وب‌اپلیکیشن مستقل)</p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                aria-label="بستن"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {isIOS ? (
                <div className="space-y-3.5 text-xs text-slate-700">
                  <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-800 font-medium">
                    راهنمای ویژه گوشی‌های آیفون و آیپد (سافاری / iOS):
                  </div>
                  <div className="space-y-3 pr-1">
                    <div className="flex items-start gap-3">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold shrink-0">۱</span>
                      <span className="leading-relaxed">
                        در نوار پایین مرورگر سافاری (Safari)، دکمه <strong className="text-slate-900 inline-flex items-center gap-1 font-semibold mx-1"><Share2 className="w-3.5 h-3.5 text-blue-600" /> Share (اشتراک‌گذاری)</strong> را لمس کنید.
                      </span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold shrink-0">۲</span>
                      <span className="leading-relaxed">
                        در منوی باز شده، گزینه <strong className="text-slate-900 inline-flex items-center gap-1 font-semibold mx-1"><PlusSquare className="w-3.5 h-3.5 text-blue-600" /> Add to Home Screen (افزودن به صفحه اصلی)</strong> را انتخاب کنید.
                      </span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold shrink-0">۳</span>
                      <span className="leading-relaxed">
                        در گوشه بالا دکمه <strong>Add (افزودن)</strong> را بزنید. آیکون برنامه مستقیماً به صفحه اصلی گوشی شما اضافه می‌شود!
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3.5 text-xs text-slate-700">
                  <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-800 font-medium">
                    راهنمای نصب در گوشی‌های اندروید (کروم / سامسونگ):
                  </div>
                  <div className="space-y-3 pr-1">
                    <div className="flex items-start gap-3">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold shrink-0">۱</span>
                      <span className="leading-relaxed">
                        در بالای مرورگر کروم، علامت <strong>سه نقطه (⋮)</strong> در گوشه صفحه را لمس کنید.
                      </span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold shrink-0">۲</span>
                      <span className="leading-relaxed">
                        گزینه <strong>«افزودن به صفحه اصلی»</strong> یا <strong>«نصب برنامه (Install App)»</strong> را انتخاب کنید.
                      </span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold shrink-0">۳</span>
                      <span className="leading-relaxed">
                        تأیید نصب را بزنید تا برنامه با آیکون اختصاصی و به شکل اپلیکیشن تمام‌صفحه نصب شود.
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Benefits */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                <span>پس از نصب، برنامه مثل یک نرم‌افزار بومی، بدون نوار آدرس و بسیار سریع باز می‌شود.</span>
              </div>

              <button
                onClick={() => setShowModal(false)}
                className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer shadow-xs"
              >
                متوجه شدم
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
