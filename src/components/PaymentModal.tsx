import React, { useState, useEffect } from 'react';
import { X, CreditCard, Check, AlertCircle } from 'lucide-react';
import { Customer, Invoice } from '../types';
import { formatToman, getTodayJalali } from '../lib/dateUtils';
import { fetchApi } from '../lib/api';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialCustomerId?: number;
  initialInvoiceId?: number;
  customers: Customer[];
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialCustomerId,
  initialInvoiceId,
  customers
}) => {
  const [customerId, setCustomerId] = useState<number>(initialCustomerId || 1);
  const [amount, setAmount] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(getTodayJalali());
  const [paymentMethod, setPaymentMethod] = useState<string>('card_to_card');
  const [trackingCode, setTrackingCode] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [customerInvoices, setCustomerInvoices] = useState<Invoice[]>([]);
  const [allocations, setAllocations] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialCustomerId) setCustomerId(initialCustomerId);
  }, [initialCustomerId]);

  // Load unpaid invoices for selected customer
  useEffect(() => {
    if (!customerId || !isOpen) return;

    fetchApi<Invoice[]>(`/invoices?customerId=${customerId}&status=all`)
      .then((invs) => {
        const unpaid = invs.filter(i => i.remaining_amount > 0 && i.status !== 'cancelled' && i.status !== 'draft');
        setCustomerInvoices(unpaid);

        // If opened for a specific invoice, pre-allocate
        if (initialInvoiceId) {
          const target = unpaid.find(i => i.id === initialInvoiceId);
          if (target) {
            setAmount(target.remaining_amount.toString());
            setAllocations({ [target.id]: target.remaining_amount });
          }
        } else if (unpaid.length > 0 && !amount) {
          // Pre-fill with oldest invoice amount
          setAmount(unpaid[0].remaining_amount.toString());
          setAllocations({ [unpaid[0].id]: unpaid[0].remaining_amount });
        }
      })
      .catch((err) => console.warn('PaymentModal invoice fetch warning:', err));
  }, [customerId, isOpen, initialInvoiceId]);

  if (!isOpen) return null;

  const totalAllocated = Object.values(allocations).reduce((sum, val) => sum + (val || 0), 0);
  const enteredAmount = parseFloat(amount) || 0;
  const unallocatedExcess = Math.max(0, enteredAmount - totalAllocated);

  const handleAllocationChange = (invoiceId: number, val: number) => {
    setAllocations(prev => ({
      ...prev,
      [invoiceId]: Math.max(0, val)
    }));
  };

  const handleAutoDistribute = () => {
    let remainingToDistribute = enteredAmount;
    const newAllocs: Record<number, number> = {};

    for (const inv of customerInvoices) {
      if (remainingToDistribute <= 0) break;
      const take = Math.min(inv.remaining_amount, remainingToDistribute);
      newAllocs[inv.id] = take;
      remainingToDistribute -= take;
    }
    setAllocations(newAllocs);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enteredAmount <= 0) {
      setError('لطفاً مبلغ معتبری وارد کنید.');
      return;
    }

    setLoading(true);
    setError(null);

    const allocList = Object.entries(allocations)
      .filter(([_, amt]) => amt > 0)
      .map(([invId, amt]) => ({
        invoiceId: parseInt(invId, 10),
        amount: Math.round(amt)
      }));

    try {
      await fetchApi('/payments', {
        method: 'POST',
        body: JSON.stringify({
          customerId,
          amount: enteredAmount,
          paymentDate,
          paymentMethod,
          trackingCode,
          notes,
          allocations: allocList
        })
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200">
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold">ثبت دریافت وجه / پرداخت مشتری</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">طرف حساب (مشتری):</label>
              <select
                value={customerId}
                onChange={(e) => {
                  setCustomerId(parseInt(e.target.value, 10));
                  setAllocations({});
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.balance && c.balance > 0 ? `(بدهی: ${c.balance.toLocaleString('fa-IR')} ت)` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">مبلغ دریافتی (تومان):</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="مثلاً ۱۰۰۰۰۰۰"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono tabular-nums text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                required
              />
              {enteredAmount > 0 && (
                <span className="text-[11px] text-emerald-600 block mt-1">
                  معادل: {formatToman(enteredAmount)}
                </span>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">تاریخ دریافت (شمسی):</label>
              <input
                type="text"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono tabular-nums text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">روش پرداخت:</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="card_to_card">کارت به کارت</option>
                <option value="cash">وجه نقد</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">شماره پیگیری / ارجاع بانک:</label>
            <input
              type="text"
              value={trackingCode}
              onChange={(e) => setTrackingCode(e.target.value)}
              placeholder="اختیاری - مثلاً شماره پیگیری کارت به کارت"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Invoice Allocations Section */}
          {customerInvoices.length > 0 && (
            <div className="pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-800">تخصیص به فاکتورهای باز مشتری:</span>
                <button
                  type="button"
                  onClick={handleAutoDistribute}
                  className="text-[11px] text-emerald-700 hover:underline"
                >
                  تخصیص خودکار از قدیمی‌ترین فاکتور
                </button>
              </div>

              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {customerInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <div>
                      <div className="font-mono font-medium text-slate-900">{inv.invoice_number}</div>
                      <div className="text-[11px] text-slate-500">
                        تاریخ: {inv.issue_date} · مانده بدهی: {formatToman(inv.remaining_amount)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500">مبلغ تخصیص:</span>
                      <input
                        type="number"
                        value={allocations[inv.id] || ''}
                        max={inv.remaining_amount}
                        onChange={(e) => handleAllocationChange(inv.id, parseFloat(e.target.value) || 0)}
                        placeholder="۰"
                        className="w-28 bg-white border border-slate-200 rounded px-2 py-1 text-xs font-mono text-left focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {unallocatedExcess > 0 && (
                <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] rounded-md">
                  مبلغ <strong>{formatToman(unallocatedExcess)}</strong> به عنوان اعتبار بستانکاری در حساب مشتری ذخیره خواهد شد.
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">یادداشت / توضیحات:</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="توضیحات اختیاری در خصوص این دریافت..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{loading ? 'در حال ثبت...' : 'تأیید و ثبت پرداخت'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
