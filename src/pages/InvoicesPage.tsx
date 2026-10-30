import React, { useState, useEffect } from 'react';
import {
  Search,
  Printer,
  CreditCard,
  Ban,
  Eye,
  PlusCircle,
  Filter
} from 'lucide-react';
import { Invoice } from '../types';
import { formatToman } from '../lib/dateUtils';
import { fetchApi } from '../lib/api';

interface InvoicesPageProps {
  onNewSale: () => void;
  onOpenPrintInvoice: (inv: Invoice) => void;
  onOpenPaymentForInvoice: (inv: Invoice) => void;
}

export const InvoicesPage: React.FC<InvoicesPageProps> = ({
  onNewSale,
  onOpenPrintInvoice,
  onOpenPaymentForInvoice
}) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadInvoices = () => {
    setLoading(true);
    let url = `/invoices?status=${statusFilter}`;
    if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;

    fetchApi<Invoice[]>(url)
      .then(setInvoices)
      .catch((err) => console.warn('Invoices fetch warning:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadInvoices();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadInvoices();
  };

  const handlePrintClick = async (invoiceId: number) => {
    try {
      const data = await fetchApi<{ invoice: Invoice; items: any[] }>(`/invoices/${invoiceId}`);
      onOpenPrintInvoice({ ...data.invoice, items: data.items });
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCancelInvoice = async (invoice: Invoice) => {
    const reason = prompt('لطفاً دلیل ابطال این فاکتور را وارد نمایید:');
    if (!reason || !reason.trim()) return;

    try {
      await fetchApi(`/invoices/${invoice.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
      alert('فاکتور با موفقیت ابطال شد و پرداختی‌های آن به اعتبار مشتری برگشت داده شد.');
      loadInvoices();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200">
        <div>
          <h2 className="text-sm font-bold text-slate-900">دفتر فاکتورهای فروش</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            فهرست فاکتورهای صادره، پیگیری مانده تسویه، چاپ فاکتور و ثبت دریافت اقساط
          </p>
        </div>
        <button
          onClick={onNewSale}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors shadow-xs"
        >
          <PlusCircle className="w-4 h-4" />
          <span>صدور فاکتور جدید</span>
        </button>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center gap-4">
        {/* Status segmented buttons */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-full sm:w-auto overflow-x-auto">
          {[
            { id: 'all', label: 'همه فاکتورها' },
            { id: 'unpaid', label: 'پرداخت نشده' },
            { id: 'partially_paid', label: 'پرداخت جزئی' },
            { id: 'paid', label: 'تسویه شده' },
            { id: 'draft', label: 'پیش‌نویس' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                statusFilter === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2 w-full">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="جستجوی شماره فاکتور یا نام خریدار..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pr-9 pl-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-medium hover:bg-slate-800"
          >
            جستجو
          </button>
        </form>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right border-collapse">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">شماره فاکتور</th>
                <th className="py-3 px-4">خریدار</th>
                <th className="py-3 px-4 text-center">تاریخ صدور</th>
                <th className="py-3 px-4 text-left">مبلغ کل</th>
                <th className="py-3 px-4 text-left">پرداخت شده</th>
                <th className="py-3 px-4 text-left">مانده بدهی</th>
                <th className="py-3 px-4 text-center">وضعیت</th>
                <th className="py-3 px-4 text-center">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    در حال دریافت فهرست فاکتورها...
                  </td>
                </tr>
              ) : invoices.length > 0 ? (
                invoices.map((inv) => {
                  const isPaid = inv.status === 'paid';
                  const isPartial = inv.status === 'partially_paid';
                  const isDraft = inv.status === 'draft';
                  const isCancelled = inv.status === 'cancelled';

                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                        {inv.invoice_number}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">
                        {inv.customer_name_snapshot}
                        {inv.customer_phone && (
                          <span className="block text-[11px] text-slate-400 font-mono">
                            {inv.customer_phone}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center font-mono tabular-nums text-slate-600">
                        {inv.issue_date}
                      </td>
                      <td className="py-3 px-4 text-left font-mono tabular-nums font-semibold text-slate-900">
                        {formatToman(inv.final_total)}
                      </td>
                      <td className="py-3 px-4 text-left font-mono tabular-nums text-emerald-700">
                        {formatToman(inv.paid_amount)}
                      </td>
                      <td className="py-3 px-4 text-left font-mono tabular-nums font-bold">
                        <span className={inv.remaining_amount > 0 ? 'text-rose-600' : 'text-slate-400'}>
                          {formatToman(inv.remaining_amount)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`text-[11px] font-medium ${
                          isPaid ? 'text-emerald-700' : isPartial ? 'text-amber-700' : isCancelled ? 'text-slate-400' : isDraft ? 'text-slate-600' : 'text-rose-600'
                        }`}>
                          {isPaid ? 'تسویه شده' : isPartial ? 'بخشی' : isCancelled ? 'ابطال شده' : isDraft ? 'پیش‌نویس' : 'پرداخت نشده'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Print / View */}
                          <button
                            onClick={() => handlePrintClick(inv.id)}
                            title="چاپ و مشاهده فاکتور"
                            className="p-1.5 text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          {/* Record Payment */}
                          {!isPaid && !isCancelled && !isDraft && (
                            <button
                              onClick={() => onOpenPaymentForInvoice(inv)}
                              title="ثبت دریافت وجه برای این فاکتور"
                              className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors"
                            >
                              <CreditCard className="w-4 h-4" />
                            </button>
                          )}

                          {/* Void / Cancel */}
                          {!isCancelled && (
                            <button
                              onClick={() => handleCancelInvoice(inv)}
                              title="ابطال فاکتور"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    فاکتوری با این مشخصات یافت نشد.
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
