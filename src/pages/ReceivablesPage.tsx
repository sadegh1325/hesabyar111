import React, { useState, useEffect } from 'react';
import {
  AlertCircle,
  CreditCard,
  FileText,
  Search,
  Download,
  Calendar,
  Phone
} from 'lucide-react';
import { Debtor } from '../types';
import { formatToman, formatNumberFa } from '../lib/dateUtils';
import { fetchApi, downloadFile } from '../lib/api';

interface ReceivablesPageProps {
  onOpenPaymentForCustomer: (customerId: number) => void;
  onOpenStatement: (customerId: number) => void;
}

export const ReceivablesPage: React.FC<ReceivablesPageProps> = ({
  onOpenPaymentForCustomer,
  onOpenStatement
}) => {
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [totalOutstanding, setTotalOutstanding] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const loadReceivables = () => {
    setLoading(true);
    fetchApi<{ debtors: Debtor[]; totalOutstandingAmount: number; debtorCount: number }>('/receivables')
      .then((data) => {
        setDebtors(data.debtors);
        setTotalOutstanding(data.totalOutstandingAmount);
      })
      .catch((err) => console.warn('Receivables fetch warning:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadReceivables();
  }, []);

  const handleDownloadExcel = async () => {
    setDownloading(true);
    try {
      await downloadFile('/reports/excel', 'Hesabyar_Receivables.xlsx');
    } catch (err: any) {
      alert(err.message || 'خطا در دانلود فایل اکسل');
    } finally {
      setDownloading(false);
    }
  };

  const filtered = debtors.filter(d =>
    d.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Banner with Total Outstanding Amount */}
      <div className="bg-rose-950 text-white rounded-xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6 border border-rose-900 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-rose-300 text-xs font-semibold mb-1">
            <AlertCircle className="w-4 h-4" />
            <span>مدیریت مطالبات و دفتر نسیه فروشگاه</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            مجموع کل مطالبات وصول‌نشده: {formatToman(totalOutstanding)}
          </h2>
          <p className="text-rose-200/80 text-xs mt-1">
            تعداد {formatNumberFa(debtors.length)} مشتری دارای مانده حساب بدهکاری می‌باشند.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadExcel}
            disabled={downloading}
            className="px-4 py-2.5 bg-rose-900/80 hover:bg-rose-800 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors border border-rose-700/50 shadow-xs cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>{downloading ? 'در حال آماده‌سازی...' : 'خروجی Excel کل مطالبات'}</span>
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center gap-3">
        <Search className="w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="جستجو در میان بدهکاران بر اساس نام و نام خانوادگی..."
          className="w-full text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} className="text-xs text-slate-400 hover:text-slate-600 px-2 cursor-pointer">
            پاک کردن
          </button>
        )}
      </div>

      {/* Debtors Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right border-collapse">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 w-12 text-center">رتبه</th>
                <th className="py-3 px-4">نام و نام خانوادگی طرف حساب</th>
                <th className="py-3 px-4 text-left font-bold text-rose-700">مجموع مانده بدهی</th>
                <th className="py-3 px-4 text-center">فاکتورهای باز</th>
                <th className="py-3 px-4 text-center">تاریخ اولین بدهی</th>
                <th className="py-3 px-4 text-center">آخرین پرداخت</th>
                <th className="py-3 px-4 text-center">عملیات وصول و تسویه</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    در حال محاسبه و بارگذاری مطالبات...
                  </td>
                </tr>
              ) : filtered.length > 0 ? (
                filtered.map((d, idx) => (
                  <tr key={d.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4 text-center font-mono text-slate-400">{idx + 1}</td>
                    <td className="py-3.5 px-4 font-semibold text-slate-900 text-sm">
                      {d.name}
                    </td>
                    <td className="py-3.5 px-4 text-left font-mono tabular-nums text-sm font-bold text-rose-600">
                      {formatToman(d.totalDebt)}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono tabular-nums font-medium text-slate-700">
                      {formatNumberFa(d.openInvoicesCount)} فاکتور
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono tabular-nums text-slate-500">
                      {d.firstDebtDate || '-'}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono tabular-nums text-emerald-700">
                      {d.lastPaymentDate || <span className="text-slate-300">-</span>}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => onOpenPaymentForCustomer(d.id)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>ثبت دریافت وجه</span>
                        </button>
                        <button
                          onClick={() => onOpenStatement(d.id)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>گردش حساب</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    {searchTerm ? 'بدهکاری با این مشخصات یافت نشد.' : 'خوشبختانه هیچ بدهی وصول‌نشده‌ای در سیستم ثبت نیست.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
