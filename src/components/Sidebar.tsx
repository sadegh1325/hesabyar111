import React from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  FileText,
  CreditCard,
  AlertCircle,
  FileSpreadsheet,
  Settings,
  Package,
  X,
  Store
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpen: boolean;
  onClose: () => void;
  storeName?: string;
}

export const navItems = [
  { id: 'dashboard', label: 'داشبورد مالی', icon: LayoutDashboard },
  { id: 'new-sale', label: 'ثبت فروش سریع', icon: ShoppingCart },
  { id: 'invoices', label: 'فاکتورها', icon: FileText },
  { id: 'customers', label: 'مشتریان', icon: Users },
  { id: 'receivables', label: 'بدهکاران و مطالبات', icon: AlertCircle },
  { id: 'payments', label: 'پرداخت‌ها و وصولی', icon: CreditCard },
  { id: 'products', label: 'کالاها و موجودی انبار', icon: Package },
  { id: 'reports', label: 'گزارش‌ها و خروجی‌ها', icon: FileSpreadsheet },
  { id: 'settings', label: 'تنظیمات و پشتیبان', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isOpen,
  onClose,
  storeName = 'فروشگاه حاج کریم و پسران'
}) => {
  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={onClose}
          onTouchStart={onClose}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 right-0 z-50 w-72 max-w-[85vw] bg-white border-l border-slate-200 flex flex-col transition-transform duration-200 ease-in-out lg:w-64 lg:translate-x-0 ${
          isOpen ? 'translate-x-0 shadow-2xl' : 'max-lg:hidden max-lg:translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
              <Store className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="font-bold text-slate-900 text-sm tracking-tight block leading-tight truncate">
                {storeName}
              </span>
              <span className="text-[11px] text-slate-500 font-medium block">
                دفتر حساب و کتاب
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg lg:hidden cursor-pointer"
            aria-label="بستن منو"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  onClose();
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors text-right cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* PWA Install Promo */}
        <div className="px-3 pb-2 shrink-0">
          <PWAInstallButton variant="sidebar" />
        </div>

        {/* Footer info */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/50 shrink-0">
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>نسخه پایدار دیتابیس</span>
            <span className="font-mono text-emerald-700 font-medium">SQLite WAL</span>
          </div>
        </div>
      </aside>
    </>
  );
};
