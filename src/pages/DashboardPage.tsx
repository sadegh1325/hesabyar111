import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  CreditCard,
  AlertCircle,
  ShoppingBag,
  FileCheck,
  Users,
  DollarSign,
  ArrowUpRight,
  PlusCircle,
  Receipt
} from 'lucide-react';
import { DashboardData } from '../types';
import { fetchApi } from '../lib/api';
import { formatToman, formatNumberFa } from '../lib/dateUtils';

interface DashboardPageProps {
  onNavigate: (tab: string) => void;
  onOpenPaymentModal: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onNavigate,
  onOpenPaymentModal
}) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetchApi<DashboardData>('/dashboard')
      .then(setData)
      .catch((err) => console.warn('Dashboard fetch warning:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8 space-y-4">
        <div className="h-28 bg-slate-200 animate-pulse rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-slate-200 animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Top Banner / Quick Actions */}
      <div className="bg-slate-900 text-white rounded-xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm border border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">پیشخوان مالی و وضعیت لحظه‌ای فروشگاه</h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            خلاصه فروش امروز، جریان وصول مطالبات و مانده حساب بدهکاران
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => onNavigate('new-sale')}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors shadow-xs"
          >
            <PlusCircle className="w-4 h-4" />
            <span>ثبت فروش جدید</span>
          </button>
          <button
            onClick={onOpenPaymentModal}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors"
          >
            <Receipt className="w-4 h-4" />
            <span>ثبت دریافت وجه</span>
          </button>
        </div>
      </div>

      {/* Main KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Today Sales */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">فروش امروز</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg font-bold font-mono tabular-nums text-slate-900">
            {formatToman(data.todaySales)}
          </div>
          <div className="text-[11px] text-slate-500 mt-2 flex items-center justify-between">
            <span>تعداد فاکتور امروز:</span>
            <span className="font-mono tabular-nums font-semibold text-slate-700">{formatNumberFa(data.todayInvoicesCount)}</span>
          </div>
        </div>

        {/* KPI 2: Today Collections */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">وصولی / دریافتی امروز</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg font-bold font-mono tabular-nums text-blue-900">
            {formatToman(data.todayReceipts)}
          </div>
          <div className="text-[11px] text-slate-500 mt-2 flex items-center justify-between">
            <span>دریافتی کل ماه:</span>
            <span className="font-mono tabular-nums font-semibold text-slate-700">{formatToman(data.monthReceipts)}</span>
          </div>
        </div>

        {/* KPI 3: Total Receivables (Outstanding Debts) */}
        <div
          onClick={() => onNavigate('receivables')}
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs cursor-pointer hover:border-rose-300 transition-colors"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium text-rose-700">کل مطالبات (بدهی مشتریان)</span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg font-bold font-mono tabular-nums text-rose-600">
            {formatToman(data.totalReceivables)}
          </div>
          <div className="text-[11px] text-slate-500 mt-2 flex items-center justify-between">
            <span>مشتریان بدهکار:</span>
            <span className="font-mono tabular-nums font-semibold text-rose-600">
              {formatNumberFa(data.debtorCount)} نفر
            </span>
          </div>
        </div>

        {/* KPI 4: Monthly Sales & Collections */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">فروش ماه جاری</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg font-bold font-mono tabular-nums text-purple-900">
            {formatToman(data.monthSales)}
          </div>
          <div className="text-[11px] text-slate-500 mt-2 flex items-center justify-between">
            <span>وصولی کل ماه:</span>
            <span className="font-mono tabular-nums font-semibold text-slate-700">{formatToman(data.monthReceipts)}</span>
          </div>
        </div>
      </div>

      {/* Secondary Data Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-amber-600" />
            <span className="text-slate-600">فاکتورهای تسویه نشده:</span>
          </div>
          <span className="font-mono tabular-nums font-bold text-amber-700">{formatNumberFa(data.unpaidInvoicesCount)} فاکتور</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-600" />
            <span className="text-slate-600">تعداد بدهکاران جاری:</span>
          </div>
          <span className="font-mono tabular-nums font-bold text-slate-800">{formatNumberFa(data.debtorCount)} نفر</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            <span className="text-slate-600">سود ناخالص تخمینی:</span>
          </div>
          <span className="font-mono tabular-nums font-bold text-emerald-700">{formatToman(data.estimatedGrossProfit)}</span>
        </div>
      </div>

      {/* Charts & Rankings Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales & Collections Trend Chart */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
            <div>
              <h3 className="text-xs font-bold text-slate-900">روند فروش و دریافتی روزهای اخیر</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">مقایسه فروش نهایی فاکتورها در برابر وجوه وصول شده</p>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1 text-slate-700">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-900 inline-block" />
                فروش
              </span>
              <span className="flex items-center gap-1 text-emerald-700">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                دریافتی
              </span>
            </div>
          </div>

          {data.salesTrend && data.salesTrend.length > 0 ? (
            <div className="space-y-3 pt-2">
              {data.salesTrend.slice(-6).map((item, idx) => {
                const maxVal = Math.max(...data.salesTrend.map(t => Math.max(t.sales, t.receipts)), 1);
                const salesPercent = Math.min(100, (item.sales / maxVal) * 100);
                const receiptPercent = Math.min(100, (item.receipts / maxVal) * 100);

                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-600 font-mono">
                      <span>{item.date}</span>
                      <div className="flex gap-4 tabular-nums">
                        <span className="text-slate-900 font-medium">{formatToman(item.sales)}</span>
                        <span className="text-emerald-700 font-medium">{formatToman(item.receipts)}</span>
                      </div>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex gap-0.5">
                      <div
                        className="h-full bg-slate-800 rounded-full transition-all duration-300"
                        style={{ width: `${salesPercent}%` }}
                      />
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                        style={{ width: `${receiptPercent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 text-xs">
              اطلاعات فروش کافی برای نمایش نمودار موجود نیست.
            </div>
          )}
        </div>

        {/* Top Products and Top Customers */}
        <div className="space-y-6">
          {/* Top Selling Products */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs">
            <h3 className="text-xs font-bold text-slate-900 mb-3 pb-2 border-b border-slate-100">
              پرفروش‌ترین کالاها (بر اساس فاکتورهای واقعی)
            </h3>
            {data.topProducts && data.topProducts.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {data.topProducts.map((p, idx) => (
                  <div key={idx} className="py-2 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-5 text-slate-400 font-mono">{idx + 1}.</span>
                      <span className="font-medium text-slate-900">{p.product_name}</span>
                    </div>
                    <div className="text-left font-mono tabular-nums text-slate-700">
                      <span className="font-semibold">{formatToman(p.total_amount)}</span>
                      <span className="text-[11px] text-slate-400 mr-2">({formatNumberFa(p.total_qty)} واحد)</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-slate-400 text-xs">هنوز کالایی فروخته نشده است.</div>
            )}
          </div>

          {/* Top Customers */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs">
            <h3 className="text-xs font-bold text-slate-900 mb-3 pb-2 border-b border-slate-100">
              مشتریان با بیشترین خرید
            </h3>
            {data.topCustomers && data.topCustomers.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {data.topCustomers.map((c, idx) => (
                  <div key={idx} className="py-2 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-5 text-slate-400 font-mono">{idx + 1}.</span>
                      <span className="font-medium text-slate-900">{c.name}</span>
                    </div>
                    <div className="text-left font-mono tabular-nums text-slate-700">
                      <span className="font-semibold text-emerald-800">{formatToman(c.total_spent)}</span>
                      <span className="text-[11px] text-slate-400 mr-2">({formatNumberFa(c.invoice_count)} فاکتور)</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-slate-400 text-xs">هنوز خریدی ثبت نشده است.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
