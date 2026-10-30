import React from 'react';
import { Menu, PlusCircle, LogOut, UserCheck } from 'lucide-react';
import { getTodayJalali } from '../lib/dateUtils';
import { PWAInstallButton } from './PWAInstallButton';

interface TopBarProps {
  onToggleSidebar: () => void;
  onNewSale: () => void;
  activeTitle: string;
  storeName: string;
  currentUser: { username: string; fullName: string } | null;
  onLogout: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onToggleSidebar,
  onNewSale,
  activeTitle,
  storeName,
  currentUser,
  onLogout
}) => {
  const today = getTodayJalali();

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-8 sticky top-0 z-30">
      {/* Zone 1: Breadcrumb & Mobile Menu Toggle */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onToggleSidebar}
          className="p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 lg:hidden"
          aria-label="باز کردن منو"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-xs font-medium text-slate-500 whitespace-nowrap shrink-0">
          <span className="text-slate-800 font-semibold">{storeName}</span>
          <span aria-hidden="true" className="text-slate-300">/</span>
          <span className="text-slate-600">{activeTitle}</span>
        </div>
      </div>

      {/* Zone 2: Date & User info */}
      <div className="hidden md:flex items-center gap-4 text-xs text-slate-500 whitespace-nowrap shrink-0">
        <div className="flex items-center gap-1.5">
          <span>امروز:</span>
          <span className="font-mono tabular-nums text-slate-800 font-medium">{today}</span>
        </div>
        {currentUser && (
          <>
            <span aria-hidden="true" className="text-slate-200">|</span>
            <div className="flex items-center gap-1.5 text-slate-700">
              <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>{currentUser.fullName || currentUser.username}</span>
            </div>
          </>
        )}
      </div>

      {/* Zone 3: PWA Install + 1 Primary Action + Logout */}
      <div className="flex items-center gap-2.5 shrink-0">
        <PWAInstallButton />

        <button
          onClick={onNewSale}
          className="px-3.5 py-2 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 shadow-xs"
        >
          <PlusCircle className="w-4 h-4" />
          <span>ثبت فروش جدید</span>
        </button>

        <button
          onClick={onLogout}
          title="خروج از حساب"
          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
