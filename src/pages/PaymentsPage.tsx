import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Printer,
  RotateCcw,
  Search,
  CheckCircle,
  PlusCircle
} from 'lucide-react';
import { Payment } from '../types';
import { formatToman } from '../lib/dateUtils';
import { fetchApi } from '../lib/api';

interface PaymentsPageProps {
  onOpenNewPayment: () => void;
  onPrintReceipt: (payment: Payment) => void;
}

export const PaymentsPage: React.FC<PaymentsPageProps> = ({
  onOpenNewPayment,
  onPrintReceipt
}) => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const loadPayments = () => {
    setLoading(true);
    fetchApi<Payment[]>('/payments')
      .then(setPayments)
      .catch((err) => console.warn('Payments fetch warning:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPayments();
  }, []);

  const handleRefund = async (payment: Payment) => {
    const reason = prompt('لطفاً دلیل استرداد / برگشت این وجه را وارد کنید:');
    if (!reason || !reason.trim()) return;

    try {
      await fetchApi(`/payments/${payment.id}/refund`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
      alert('پرداخت با موفقیت برگشت داده شد و مانده فاکتور و مشتری به‌روزرسانی گردید.');
      loadPayments();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const filtered = payments.filter(p =>
    (p.customer_name && p.customer_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.tracking_code && p.tracking_code.includes(searchTerm)) ||
    (p.notes && p.notes.includes(searchTerm))
  );

  const methodFa: Record<string, string> = {
    card_to_card: 'کارت به کارت',
    bank_transfer: 'کارت به کارت',
    pos: 'کارت به کارت',
    cash: 'وجه نقد',
    credit: 'اعتبار قبلی',
    other: 'کارت به کارت'
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200">
        <div>
          <h2 className="text-sm font-bold text-slate-900">دفتر دریافت‌ها و پرداخت‌های مشتریان</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            ثبت دریافت‌های چندمرحله‌ای، تخصیص به چند فاکتور، صدور رسید و استرداد وجه با ثبت تاریخچه
          </p>
        </div>
        <button
          onClick={onOpenNewPayment}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors shadow-xs"
        >
          <PlusCircle className="w-4 h-4" />
          <span>ثبت دریافت وجه جدید</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center gap-3">
        <Search className="w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="جستجوی نام مشتری یا شماره پیگیری فیش..."
          className="w-full text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} className="text-xs text-slate-400 hover:text-slate-600 px-2">
            پاک کردن
          </button>
        )}
      </div>

      {/* Payments Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right border-collapse">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 w-12 text-center">شناسه</th>
                <th className="py-3 px-4">پرداخت‌کننده</th>
                <th className="py-3 px-4 text-center">تاریخ</th>
                <th className="py-3 px-4 text-left">مبلغ دریافتی</th>
                <th className="py-3 px-4 text-center">روش</th>
                <th className="py-3 px-4">کد پیگیری / ارجاع</th>
                <th className="py-3 px-4">تخصیص به فاکتور</th>
                <th className="py-3 px-4 text-center">وضعیت</th>
                <th className="py-3 px-4 text-center">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    در حال دریافت تراکنش‌ها...
                  </td>
                </tr>
              ) : filtered.length > 0 ? (
                filtered.map((p) => {
                  const isValid = p.status === 'valid';

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 text-center font-mono text-slate-400">{p.id}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {p.customer_name || 'مشتری'}
                      </td>
                      <td className="py-3 px-4 text-center font-mono tabular-nums text-slate-600">
                        {p.payment_date}
                      </td>
                      <td className="py-3 px-4 text-left font-mono tabular-nums font-bold text-emerald-800">
                        {formatToman(p.amount)}
                      </td>
                      <td className="py-3 px-4 text-center text-slate-700">
                        {methodFa[p.payment_method] || p.payment_method}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {p.tracking_code || <span className="text-slate-300">-</span>}
                      </td>
                      <td className="py-3 px-4">
                        {p.allocations && p.allocations.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {p.allocations.map((a, idx) => (
                              <span key={idx} className="text-[11px] font-mono text-slate-600">
                                فاکتور {a.invoice_number} ({formatToman(a.amount)})
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[11px] text-blue-600">اعتبار بستانکاری مشتری</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`text-[11px] font-medium ${isValid ? 'text-emerald-700' : 'text-rose-600'}`}>
                          {isValid ? 'معتبر' : 'استرداد شده'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Print Receipt */}
                          <button
                            onClick={() => onPrintReceipt(p)}
                            title="چاپ رسید رسمی پرداخت"
                            className="p-1.5 text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          {/* Refund/Void */}
                          {isValid && (
                            <button
                              onClick={() => handleRefund(p)}
                              title="استرداد یا اصلاح پرداخت"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    هیچ پرداختی یافت نشد.
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
