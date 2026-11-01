import React, { useState } from 'react';
import {
  UserPlus,
  Search,
  FileText,
  CreditCard,
  Edit2,
  Trash2,
  Download,
  FileDown,
  Printer,
  ChevronLeft
} from 'lucide-react';
import { Customer } from '../types';
import { formatToman, formatNumberFa } from '../lib/dateUtils';
import { fetchApi } from '../lib/api';
import { CustomerModal } from '../components/CustomerModal';

interface CustomersPageProps {
  customers: Customer[];
  onRefreshData: () => void;
  onOpenStatement: (customerId: number) => void;
  onOpenPaymentForCustomer: (customerId: number) => void;
  onDownloadPdf: (customerId: number) => void;
}

export const CustomersPage: React.FC<CustomersPageProps> = ({
  customers,
  onRefreshData,
  onOpenStatement,
  onOpenPaymentForCustomer,
  onDownloadPdf
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState<Customer | null>(null);
  const [downloadingPdfId, setDownloadingPdfId] = useState<number | null>(null);

  const handleDownload = async (customerId: number) => {
    setDownloadingPdfId(customerId);
    try {
      await onDownloadPdf(customerId);
    } finally {
      setTimeout(() => setDownloadingPdfId(null), 1000);
    }
  };

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDelete = async (customer: Customer) => {
    if (!confirm(`آیا از حذف یا غیرفعال‌سازی مشتری "${customer.name}" اطمینان دارید؟`)) {
      return;
    }
    try {
      const res = await fetchApi<{ success: boolean; message: string }>(`/customers/${customer.id}`, {
        method: 'DELETE'
      });
      alert(res.message);
      onRefreshData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200">
        <div>
          <h2 className="text-sm font-bold text-slate-900">پرونده مشتریان و طرف‌های حساب</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            مدیریت حساب مشتریان بر اساس نام و نام خانوادگی، سوابق فاکتورها، گردش مالی و دریافت گزارش
          </p>
        </div>
        <button
          onClick={() => {
            setCustomerToEdit(null);
            setIsAddModalOpen(true);
          }}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors shadow-xs cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>افزودن مشتری جدید</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center gap-3">
        <Search className="w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="جستجوی نام و نام خانوادگی مشتری..."
          className="w-full text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="text-xs text-slate-400 hover:text-slate-600 px-2 cursor-pointer"
          >
            پاک کردن
          </button>
        )}
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right border-collapse">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 w-12 text-center">شناسه</th>
                <th className="py-3 px-4">نام و نام خانوادگی طرف حساب</th>
                <th className="py-3 px-4 text-left">مجموع خرید</th>
                <th className="py-3 px-4 text-left">مجموع پرداخت</th>
                <th className="py-3 px-4 text-left">مانده حساب</th>
                <th className="py-3 px-4 text-center">وضعیت</th>
                <th className="py-3 px-4 text-center">عملیات مالی و گزارش</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length > 0 ? (
                filtered.map((c) => {
                  const netBalance = c.balance || 0;
                  const isDebtor = netBalance > 0;
                  const isCreditor = netBalance < 0;

                  return (
                    <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 text-center font-mono text-slate-400">{c.id}</td>
                      <td className="py-3.5 px-4 text-slate-900">
                        <div className="font-semibold text-slate-900 text-sm">{c.name}</div>
                        {c.phone && (
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5" dir="ltr">
                            {c.phone}
                          </div>
                        )}
                        {c.address && (
                          <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-xs">
                            {c.address}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-left font-mono tabular-nums text-slate-800">
                        {formatToman(c.totalInvoiced)}
                      </td>
                      <td className="py-3.5 px-4 text-left font-mono tabular-nums text-emerald-700">
                        {formatToman(c.totalPaid)}
                      </td>
                      <td className="py-3.5 px-4 text-left font-mono tabular-nums font-bold">
                        <span className={isDebtor ? 'text-rose-600' : isCreditor ? 'text-blue-600' : 'text-slate-500'}>
                          {formatToman(netBalance)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          isDebtor ? 'bg-rose-50 text-rose-700 border border-rose-200' : isCreditor ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}>
                          {isDebtor ? 'بدهکار' : isCreditor ? 'بستانکار' : 'تسویه'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Record Payment */}
                          <button
                            onClick={() => onOpenPaymentForCustomer(c.id)}
                            title="ثبت دریافت وجه"
                            className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors cursor-pointer"
                          >
                            <CreditCard className="w-4 h-4" />
                          </button>

                          {/* View Statement & Print */}
                          <button
                            onClick={() => onOpenStatement(c.id)}
                            title="مشاهده گردش حساب و فاکتورها"
                            className="p-1.5 text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                          >
                            <FileText className="w-4 h-4" />
                          </button>

                          {/* Download PDF Report */}
                          <button
                            onClick={() => handleDownload(c.id)}
                            disabled={downloadingPdfId === c.id}
                            title={`دانلود فایل PDF صورت‌حساب (${c.name})`}
                            className="p-1.5 text-rose-700 hover:bg-rose-50 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {downloadingPdfId === c.id ? (
                              <div className="w-4 h-4 border-2 border-rose-600 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <FileDown className="w-4 h-4" />
                            )}
                          </button>

                          {/* Edit */}
                          <button
                            onClick={() => {
                              setCustomerToEdit(c);
                              setIsAddModalOpen(true);
                            }}
                            title="ویرایش نام مشتری"
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          {c.id !== 1 && (
                            <button
                              onClick={() => handleDelete(c)}
                              title="حذف یا غیرفعال‌سازی"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    مشتری با این مشخصات یافت نشد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CustomerModal
        isOpen={isAddModalOpen}
        customerToEdit={customerToEdit}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={() => onRefreshData()}
      />
    </div>
  );
};
