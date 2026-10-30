import React, { useRef, useState } from 'react';
import { X, Printer, FileDown, CheckCircle } from 'lucide-react';
import { Customer, Invoice, Payment } from '../types';
import { formatToman, getTodayJalali } from '../lib/dateUtils';
import { downloadFile } from '../lib/api';

interface PrintStatementModalProps {
  data: {
    customer: Customer;
    summary: any;
    invoices: Invoice[];
    payments: Payment[];
  } | null;
  onClose: () => void;
  storeSettings?: Record<string, string>;
  onDownloadPdf?: (customerId: number) => void;
}

export const PrintStatementModal: React.FC<PrintStatementModalProps> = ({
  data,
  onClose,
  storeSettings = {},
  onDownloadPdf
}) => {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const printAreaRef = useRef<HTMLDivElement>(null);

  if (!data) return null;
  const { customer, summary, invoices, payments } = data;
  const storeName = storeSettings['store_name'] || 'فروشگاه حاج کریم و پسران';
  const today = getTodayJalali();

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    const filename = `${customer.name.trim()}.pdf`;

    try {
      if (onDownloadPdf) {
        await onDownloadPdf(customer.id);
      } else {
        await downloadFile(`/reports/pdf/${customer.id}`, filename);
      }
    } catch (err: any) {
      alert(`خطا در دانلود فایل PDF: ${err?.message || 'مشکلی رخ داد.'}`);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-200">
        <div className="no-print bg-slate-100 border-b border-slate-200 px-6 py-3.5 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-800">
            صورت‌حساب و گردش مالی مشتری: {customer.name}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-medium hover:bg-rose-700 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              title={`دانلود فایل PDF به نام ${customer.name}`}
            >
              {isGeneratingPdf ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>در حال دانلود PDF...</span>
                </>
              ) : (
                <>
                  <FileDown className="w-3.5 h-3.5" />
                  <span>دریافت فایل PDF</span>
                </>
              )}
            </button>
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-medium hover:bg-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>چاپ صورت‌حساب</span>
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-slate-800 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div ref={printAreaRef} className="p-8 text-slate-900 bg-white">
          {/* Header */}
          <div className="border-b-2 border-slate-900 pb-4 mb-6 flex justify-between items-start">
            <div>
              <h2 className="text-lg font-bold text-slate-900">{storeName}</h2>
              <h3 className="text-sm font-semibold text-slate-700 mt-1">گزارش جامع گردش حساب مشتری</h3>
              <p className="text-xs text-slate-500 mt-0.5">نام و نام خانوادگی طرف حساب: {customer.name}</p>
            </div>
            <div className="text-left text-xs text-slate-500">
              <div>تاریخ تهیه گزارش: <span className="font-mono tabular-nums text-slate-900">{today}</span></div>
              <div className="mt-1">
                وضعیت نهایی:{' '}
                <span className={`font-bold ${summary.netBalance > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                  {summary.netBalance > 0
                    ? `بدهکار (${formatToman(summary.netBalance)})`
                    : summary.netBalance < 0
                    ? `بستانکار (${formatToman(Math.abs(summary.netBalance))})`
                    : 'تسویه کامل'}
                </span>
              </div>
            </div>
          </div>

          {/* KPI Strip */}
          <div className="grid grid-cols-3 gap-4 mb-6 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
            <div>
              <span className="text-slate-500 block">مجموع فاکتورها:</span>
              <span className="font-mono tabular-nums text-sm font-bold text-slate-900">{formatToman(summary.totalInvoiced)}</span>
            </div>
            <div>
              <span className="text-slate-500 block">مجموع پرداخت‌ها:</span>
              <span className="font-mono tabular-nums text-sm font-bold text-emerald-700">{formatToman(summary.totalPaid)}</span>
            </div>
            <div>
              <span className="text-slate-500 block">مانده حساب نهایی:</span>
              <span className={`font-mono tabular-nums text-sm font-bold ${summary.netBalance > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                {formatToman(summary.netBalance)}
              </span>
            </div>
          </div>

          {/* Invoices List */}
          <div className="mb-6">
            <h4 className="text-xs font-bold text-slate-800 mb-2">فهرست فاکتورهای ثبت شده:</h4>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs text-right border-collapse">
                <thead className="bg-slate-100 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3">شماره فاکتور</th>
                    <th className="py-2 px-3 text-center">تاریخ صدور</th>
                    <th className="py-2 px-3 text-left">مبلغ کل</th>
                    <th className="py-2 px-3 text-left">پرداخت شده</th>
                    <th className="py-2 px-3 text-left">مانده بدهی</th>
                    <th className="py-2 px-3 text-center">وضعیت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.length > 0 ? (
                    invoices.map((inv) => (
                      <tr key={inv.id}>
                        <td className="py-2 px-3 font-mono text-slate-900">{inv.invoice_number}</td>
                        <td className="py-2 px-3 text-center font-mono tabular-nums text-slate-600">{inv.issue_date}</td>
                        <td className="py-2 px-3 text-left font-mono tabular-nums">{formatToman(inv.final_total)}</td>
                        <td className="py-2 px-3 text-left font-mono tabular-nums text-emerald-700">{formatToman(inv.paid_amount)}</td>
                        <td className="py-2 px-3 text-left font-mono tabular-nums font-semibold text-rose-600">{formatToman(inv.remaining_amount)}</td>
                        <td className="py-2 px-3 text-center">
                          <span className={`text-[11px] ${inv.remaining_amount === 0 ? 'text-emerald-700 font-medium' : 'text-amber-700 font-medium'}`}>
                            {inv.status === 'paid' ? 'تسویه' : inv.status === 'partially_paid' ? 'بخشی' : 'پرداخت نشده'}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={6} className="py-3 text-center text-slate-400">هیچ فاکتوری ثبت نشده است.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payments List */}
          <div>
            <h4 className="text-xs font-bold text-slate-800 mb-2">سوابق پرداخت‌های دریافتی:</h4>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs text-right border-collapse">
                <thead className="bg-slate-100 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3 w-12 text-center">شناسه</th>
                    <th className="py-2 px-3 text-center">تاریخ</th>
                    <th className="py-2 px-3 text-left">مبلغ پرداختی</th>
                    <th className="py-2 px-3 text-center">روش</th>
                    <th className="py-2 px-3">کد پیگیری / شرح</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.length > 0 ? (
                    payments.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2 px-3 text-center font-mono text-slate-500">{p.id}</td>
                        <td className="py-2 px-3 text-center font-mono tabular-nums text-slate-600">{p.payment_date}</td>
                        <td className="py-2 px-3 text-left font-mono tabular-nums font-semibold text-emerald-700">{formatToman(p.amount)}</td>
                        <td className="py-2 px-3 text-center text-slate-600">
                          {p.payment_method === 'cash' ? 'نقدی' : p.payment_method === 'pos' ? 'کارتخوان' : p.payment_method === 'bank_transfer' ? 'بانکی' : 'سایر'}
                        </td>
                        <td className="py-2 px-3 text-slate-500">{p.tracking_code || p.notes || '-'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={5} className="py-3 text-center text-slate-400">هیچ پرداختی ثبت نشده است.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
