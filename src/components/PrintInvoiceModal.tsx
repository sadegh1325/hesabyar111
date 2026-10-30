import React from 'react';
import { X, Printer } from 'lucide-react';
import { Invoice } from '../types';
import { formatToman, formatNumberFa } from '../lib/dateUtils';

interface PrintInvoiceModalProps {
  invoice: Invoice | null;
  onClose: () => void;
  storeSettings?: Record<string, string>;
}

export const PrintInvoiceModal: React.FC<PrintInvoiceModalProps> = ({
  invoice,
  onClose,
  storeSettings = {}
}) => {
  if (!invoice) return null;

  const handlePrint = () => {
    window.print();
  };

  const storeName = storeSettings['store_name'] || 'فروشگاه پارس';
  const storePhone = storeSettings['store_phone'] || '';
  const storeAddress = storeSettings['store_address'] || '';
  const headerNote = storeSettings['invoice_header_note'] || 'از حسن انتخاب و اعتماد شما سپاسگزاریم.';
  const footerNote = storeSettings['invoice_footer_note'] || 'اجناس فروخته شده با ارائه فاکتور تا ۴۸ ساعت قابل تعویض می‌باشند.';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-200">
        {/* Modal Controls Bar (Hidden during print) */}
        <div className="no-print bg-slate-100 border-b border-slate-200 px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
            <span>پیش‌نمایش چاپ فاکتور:</span>
            <span className="font-mono text-emerald-700">{invoice.invoice_number}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="px-4 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-medium hover:bg-slate-800 transition-colors flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>چاپ فاکتور</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-500 hover:text-slate-800 rounded-md"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Invoice Printable Sheet */}
        <div className="p-8 sm:p-10 text-slate-900 bg-white" id="invoice-sheet">
          {/* Header */}
          <div className="border-b-2 border-slate-900 pb-5 mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-bold text-slate-900">{storeName}</h1>
                <p className="text-xs text-slate-500 mt-1">{headerNote}</p>
                {storeAddress && (
                  <p className="text-xs text-slate-600 mt-1">نشانی: {storeAddress}</p>
                )}
                {storePhone && (
                  <p className="text-xs text-slate-600">تلفن تماس: {storePhone}</p>
                )}
              </div>
              <div className="text-left">
                <div className="text-sm font-bold text-slate-900 font-mono">
                  شماره: {invoice.invoice_number}
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  تاریخ صدور: <span className="font-mono tabular-nums">{invoice.issue_date}</span>
                </div>
                {invoice.due_date && (
                  <div className="text-xs text-slate-600 mt-0.5">
                    سررسید: <span className="font-mono tabular-nums">{invoice.due_date}</span>
                  </div>
                )}
                <div className="text-xs font-medium mt-1">
                  وضعیت:{' '}
                  <span className={invoice.remaining_amount === 0 ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>
                    {invoice.status === 'paid' ? 'تسویه شده' : invoice.status === 'partially_paid' ? 'پرداخت جزئی' : 'پرداخت نشده'}
                  </span>
                </div>
              </div>
            </div>

            {/* Customer Details */}
            <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-500">خریدار: </span>
                <span className="font-semibold text-slate-900">{invoice.customer_name_snapshot}</span>
              </div>
              {invoice.customer_phone && (
                <div className="text-left">
                  <span className="text-slate-500">تلفن خریدار: </span>
                  <span className="font-mono text-slate-800">{invoice.customer_phone}</span>
                </div>
              )}
            </div>
          </div>

          {/* Items Table */}
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-xs text-right border-collapse">
              <thead>
                <tr className="border-b border-slate-300 text-slate-600 bg-slate-50">
                  <th className="py-2.5 px-3 w-12 text-center">ردیف</th>
                  <th className="py-2.5 px-3">شرح کالا یا خدمات</th>
                  <th className="py-2.5 px-3 text-center">تعداد / مقدار</th>
                  <th className="py-2.5 px-3 text-center">واحد</th>
                  <th className="py-2.5 px-3 text-left">قیمت واحد (تومان)</th>
                  <th className="py-2.5 px-3 text-left">تخفیف</th>
                  <th className="py-2.5 px-3 text-left">مبلغ کل (تومان)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {invoice.items && invoice.items.length > 0 ? (
                  invoice.items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="py-2.5 px-3 text-center text-slate-500">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">{it.productName}</td>
                      <td className="py-2.5 px-3 text-center font-mono tabular-nums">{formatNumberFa(it.quantity)}</td>
                      <td className="py-2.5 px-3 text-center text-slate-600">{it.unit}</td>
                      <td className="py-2.5 px-3 text-left font-mono tabular-nums">{formatNumberFa(it.unitPrice)}</td>
                      <td className="py-2.5 px-3 text-left font-mono tabular-nums text-slate-500">
                        {it.discountAmount > 0 ? formatNumberFa(it.discountAmount) : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-left font-mono tabular-nums font-semibold text-slate-900">
                        {formatNumberFa(it.totalAmount)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-4 text-center text-slate-400">
                      ردیفی برای نمایش وجود ندارد
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals Summary */}
          <div className="flex justify-end mb-8">
            <div className="w-72 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>جمع ردیف‌ها:</span>
                <span className="font-mono tabular-nums">{formatToman(invoice.subtotal)}</span>
              </div>
              {invoice.discount_amount > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span>تخفیف فاکتور:</span>
                  <span className="font-mono tabular-nums">- {formatToman(invoice.discount_amount)}</span>
                </div>
              )}
              {invoice.additional_charges > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>هزینه‌های جانبی:</span>
                  <span className="font-mono tabular-nums">+ {formatToman(invoice.additional_charges)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-sm text-slate-900 pt-2 border-t border-slate-300">
                <span>مبلغ نهایی فاکتور:</span>
                <span className="font-mono tabular-nums text-emerald-800">{formatToman(invoice.final_total)}</span>
              </div>
              <div className="flex justify-between text-slate-700 pt-1">
                <span>مبلغ پرداخت شده:</span>
                <span className="font-mono tabular-nums">{formatToman(invoice.paid_amount)}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-900 pt-1 border-t border-slate-200">
                <span>مانده قابل پرداخت:</span>
                <span className={`font-mono tabular-nums ${invoice.remaining_amount > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                  {formatToman(invoice.remaining_amount)}
                </span>
              </div>
            </div>
          </div>

          {/* Footer & Signatures */}
          <div className="pt-6 border-t border-slate-300 text-xs text-slate-500 flex items-end justify-between">
            <div className="max-w-md">
              <p className="font-medium text-slate-700 mb-1">{footerNote}</p>
              {invoice.notes && <p className="text-slate-500">توضیحات: {invoice.notes}</p>}
            </div>
            <div className="text-center w-36">
              <div className="h-12 border-b border-dashed border-slate-400 mb-1"></div>
              <span>مهر و امضای فروشگاه</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
