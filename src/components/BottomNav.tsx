import React from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  FileText,
  Package,
  Users,
  Menu
} from 'lucide-react';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenMenu: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  setActiveTab,
  onOpenMenu
}) => {
  const items = [
    { id: 'dashboard', label: 'داشبورد', icon: LayoutDashboard },
    { id: 'new-sale', label: 'فروش', icon: ShoppingCart },
    { id: 'invoices', label: 'فاکتورها', icon: FileText },
    { id: 'products', label: 'کالاها و انبار', icon: Package },
    { id: 'customers', label: 'مشتریان', icon: Users },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 lg:hidden px-1.5 py-1 flex items-center justify-around shadow-lg select-none">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        const isSale = item.id === 'new-sale';

        if (isSale) {
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center -mt-3.5 px-2 py-0.5 cursor-pointer transition-transform active:scale-95 shrink-0`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-md ${isActive ? 'bg-emerald-700 text-white ring-2 ring-emerald-300' : 'bg-emerald-600 text-white'}`}>
                <Icon className="w-5 h-5" />
              </div>
              <span className={`text-[10px] font-bold mt-0.5 ${isActive ? 'text-emerald-700' : 'text-slate-700'}`}>
                {item.label}
              </span>
            </button>
          );
        }

        return (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center justify-center py-1 px-1.5 min-w-[48px] rounded-lg transition-colors cursor-pointer shrink-0 ${
              isActive ? 'text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Icon className={`w-4 h-4 mb-0.5 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
            <span className="text-[10px] tracking-tight whitespace-nowrap">{item.label}</span>
          </button>
        );
      })}

      {/* Menu / More Button */}
      <button
        onClick={onOpenMenu}
        className="flex flex-col items-center justify-center py-1 px-1.5 min-w-[44px] rounded-lg text-slate-500 hover:text-slate-800 transition-colors cursor-pointer shrink-0"
        aria-label="سایر بخش‌های سامانه"
      >
        <Menu className="w-4 h-4 mb-0.5 text-slate-400" />
        <span className="text-[10px] tracking-tight whitespace-nowrap">منو</span>
      </button>
    </nav>
  );
};
