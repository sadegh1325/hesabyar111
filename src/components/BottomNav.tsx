import React from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  FileText,
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
    { id: 'new-sale', label: 'فروش سریع', icon: ShoppingCart },
    { id: 'invoices', label: 'فاکتورها', icon: FileText },
    { id: 'customers', label: 'مشتریان', icon: Users },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 lg:hidden px-2 py-1 flex items-center justify-around shadow-lg select-none">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        const isSale = item.id === 'new-sale';

        if (isSale) {
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center -mt-4 px-3 py-1 cursor-pointer transition-transform active:scale-95`}
            >
              <div className={`w-11 h-11 rounded-full flex items-center justify-center shadow-md ${isActive ? 'bg-emerald-700 text-white ring-2 ring-emerald-300' : 'bg-emerald-600 text-white'}`}>
                <Icon className="w-5 h-5" />
              </div>
              <span className={`text-[10px] font-medium mt-0.5 ${isActive ? 'text-emerald-700 font-bold' : 'text-slate-600'}`}>
                {item.label}
              </span>
            </button>
          );
        }

        return (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center justify-center py-1.5 px-3 min-w-[56px] rounded-lg transition-colors cursor-pointer ${
              isActive ? 'text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Icon className={`w-5 h-5 mb-0.5 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
            <span className="text-[10px] tracking-tight">{item.label}</span>
          </button>
        );
      })}

      {/* Menu / More Button */}
      <button
        onClick={onOpenMenu}
        className="flex flex-col items-center justify-center py-1.5 px-3 min-w-[56px] rounded-lg text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
        aria-label="سایر بخش‌های سامانه"
      >
        <Menu className="w-5 h-5 mb-0.5 text-slate-400" />
        <span className="text-[10px] tracking-tight">سایر منوها</span>
      </button>
    </nav>
  );
};
