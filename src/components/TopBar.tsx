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
    <header className="h-16 bg-white border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between gap-3 sm:gap-6 sticky top-0 z-20">
      {/* Zone 1: Breadcrumb & Mobile Menu Toggle */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          onClick={onToggleSidebar}
          className="p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 lg:hidden cursor-pointer shrink-0"
          aria-label="باز کردن منو"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-1.5 sm:gap-2 text-xs font-medium text-slate-500 whitespace-nowrap min-w-0 truncate">
          <span className="text-slate-800 font-semibold truncate hidden md:inline">{storeName}</span>
          <span aria-hidden="true" className="text-slate-300 hidden md:inline">/</span>
          <span className="text-slate-900 font-bold truncate">{activeTitle}</span>
        </div>
      </div>

      {/* Zone 2: Date & User info (visible on medium+ screens) */}
      <div className="hidden lg:flex items-center gap-4 text-xs text-slate-500 whitespace-nowrap shrink-0">
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
      <div className="flex items-center gap-2 shrink-0">
        <div className="hidden sm:block">
          <PWAInstallButton />
        </div>

        <button
          onClick={onNewSale}
          className="px-2.5 py-1.5 sm:px-3.5 sm:py-2 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 shadow-xs cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          <span className="hidden sm:inline">ثبت فروش جدید</span>
          <span className="sm:hidden text-[11px]">فروش</span>
        </button>

        <button
          onClick={onLogout}
          title="خروج از حساب"
          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
