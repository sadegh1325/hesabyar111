import React from 'react';
import { X, Printer, CheckCircle } from 'lucide-react';
import { Payment } from '../types';
import { formatToman } from '../lib/dateUtils';

interface PrintReceiptModalProps {
  payment: Payment | null;
  onClose: () => void;
  storeSettings?: Record<string, string>;
}

export const PrintReceiptModal: React.FC<PrintReceiptModalProps> = ({
  payment,
  onClose,
  storeSettings = {}
}) => {
  if (!payment) return null;

  const storeName = storeSettings['store_name'] || 'فروشگاه پارس';
  const methodFa: Record<string, string> = {
    cash: 'نقدی',
    pos: 'کارتخوان (POS)',
    bank_transfer: 'انتقال بانکی / کارت به کارت',
    other: 'سایر روش‌ها'
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
        <div className="no-print bg-slate-100 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-800">رسید پرداخت وجه</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="px-3 py-1 bg-slate-900 text-white rounded-md text-xs font-medium hover:bg-slate-800 transition-colors flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>چاپ رسید</span>
            </button>
            <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-8 text-slate-900 bg-white border border-slate-300 m-4 rounded-lg">
          <div className="text-center border-b border-slate-200 pb-4 mb-4">
            <h2 className="text-base font-bold text-slate-900">{storeName}</h2>
            <div className="flex items-center justify-center gap-1 text-emerald-700 font-medium text-xs mt-1">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>رسید رسمی دریافت وجه</span>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">شماره رسید تراکنش:</span>
              <span className="font-mono tabular-nums font-semibold">{payment.id}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">تاریخ دریافت:</span>
              <span className="font-mono tabular-nums">{payment.payment_date}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">پرداخت‌کننده:</span>
              <span className="font-semibold text-slate-900">{payment.customer_name || 'مشتری'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">روش پرداخت:</span>
              <span className="font-medium text-slate-800">{methodFa[payment.payment_method] || payment.payment_method}</span>
            </div>
            {payment.tracking_code && (
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">شماره پیگیری / ارجاع:</span>
                <span className="font-mono tabular-nums text-slate-800">{payment.tracking_code}</span>
              </div>
            )}
            <div className="flex justify-between py-2 border-b-2 border-slate-900 text-sm font-bold bg-slate-50 px-2 rounded-md">
              <span className="text-slate-900">مبلغ دریافت شده:</span>
              <span className="font-mono tabular-nums text-emerald-800">{formatToman(payment.amount)}</span>
            </div>

            {payment.allocations && payment.allocations.length > 0 && (
              <div className="pt-2">
                <span className="text-slate-500 font-medium block mb-1">تخصیص به فاکتورها:</span>
                <div className="space-y-1">
                  {payment.allocations.map((a, idx) => (
                    <div key={idx} className="flex justify-between text-[11px] bg-slate-50 px-2 py-1 rounded">
                      <span>فاکتور {a.invoice_number}</span>
                      <span className="font-mono tabular-nums">{formatToman(a.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {payment.notes && (
              <div className="pt-2 text-slate-500">
                <span>توضیحات: </span>
                <span>{payment.notes}</span>
              </div>
            )}
          </div>

          <div className="mt-8 pt-4 border-t border-slate-200 flex justify-between text-[11px] text-slate-400">
            <span>امضای تحویل‌گیرنده</span>
            <span>امضای پرداخت‌کننده</span>
          </div>
        </div>
      </div>
    </div>
  );
};
