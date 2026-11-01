import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Save,
  CheckCircle,
  AlertCircle,
  UserPlus,
  PackagePlus,
  Printer
} from 'lucide-react';
import { Customer, Product, InvoiceItem, Invoice } from '../types';
import { fetchApi } from '../lib/api';
import { formatToman, formatNumberFa, getTodayJalali } from '../lib/dateUtils';
import { CustomerModal } from '../components/CustomerModal';
import { ProductModal } from '../components/ProductModal';

interface NewSalePageProps {
  customers: Customer[];
  products: Product[];
  onRefreshData: () => void;
  onOpenPrintInvoice: (inv: Invoice) => void;
}

export const NewSalePage: React.FC<NewSalePageProps> = ({
  customers,
  products,
  onRefreshData,
  onOpenPrintInvoice
}) => {
  const [selectedCustomerId, setSelectedCustomerId] = useState<number>(1);
  const [issueDate, setIssueDate] = useState<string>(getTodayJalali());
  const [dueDate, setDueDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Items in the invoice
  const [items, setItems] = useState<InvoiceItem[]>([
    {
      productName: '',
      unit: 'عدد',
      quantity: 1,
      unitPrice: 0,
      discountAmount: 0,
      totalAmount: 0
    }
  ]);

  // Invoice level discounts and charges
  const [discountType, setDiscountType] = useState<'amount' | 'percent'>('amount');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [additionalCharges, setAdditionalCharges] = useState<number>(0);

  // Initial payment
  const [initialPayment, setInitialPayment] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>('card_to_card');
  const [trackingCode, setTrackingCode] = useState<string>('');

  // Modals for quick customer/product creation
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Calculate row total
  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    setItems(prev => {
      const copy = [...prev];
      const item = { ...copy[index], [field]: value };

      if (field === 'productId') {
        const prod = products.find(p => p.id === Number(value));
        if (prod) {
          item.productName = prod.name;
          item.unit = prod.unit;
          item.unitPrice = prod.default_sale_price || 0;
          item.purchasePrice = prod.purchase_price || 0;
        }
      }

      const qty = parseFloat(item.quantity as any) || 0;
      const price = parseFloat(item.unitPrice as any) || 0;
      const disc = parseFloat(item.discountAmount as any) || 0;
      item.totalAmount = Math.max(0, Math.round(qty * price - disc));

      copy[index] = item;
      return copy;
    });
  };

  const addItemRow = () => {
    setItems(prev => [
      ...prev,
      {
        productName: '',
        unit: 'عدد',
        quantity: 1,
        unitPrice: 0,
        discountAmount: 0,
        totalAmount: 0
      }
    ]);
  };

  const removeItemRow = (index: number) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  // Calculations
  const subtotal = items.reduce((sum, it) => sum + (it.totalAmount || 0), 0);
  let invoiceDiscountAmount = 0;
  if (discountType === 'percent') {
    invoiceDiscountAmount = Math.round((subtotal * Math.min(100, Math.max(0, discountValue))) / 100);
  } else {
    invoiceDiscountAmount = Math.min(subtotal, Math.max(0, discountValue));
  }

  const finalTotal = Math.max(0, subtotal - invoiceDiscountAmount + (Number(additionalCharges) || 0));
  const remainingDue = Math.max(0, finalTotal - (Number(initialPayment) || 0));

  const handleQuickPayFull = () => {
    setInitialPayment(finalTotal);
  };

  const handleSubmit = async (isDraft: boolean) => {
    // Validate items
    const validItems = items.filter(it => it.productName.trim() && it.quantity > 0);
    if (validItems.length === 0) {
      setError('حداقل یک قلم کالا با نام و تعداد معتبر وارد کنید.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetchApi<{ success: boolean; invoiceId: number; invoiceNumber: string }>('/invoices', {
        method: 'POST',
        body: JSON.stringify({
          customerId: selectedCustomerId,
          issueDate,
          dueDate: dueDate || null,
          items: validItems,
          discountType,
          discountValue,
          additionalCharges,
          initialPaymentAmount: initialPayment,
          paymentMethod,
          paymentTrackingCode: trackingCode,
          notes,
          isDraft
        })
      });

      setSuccessMsg(`فاکتور با شماره ${res.invoiceNumber} با موفقیت ثبت شد.`);
      onRefreshData();

      // Fetch the created invoice to show print modal
      fetchApi<{ invoice: Invoice; items: InvoiceItem[] }>(`/invoices/${res.invoiceId}`)
        .then(invData => {
          onOpenPrintInvoice({ ...invData.invoice, items: invData.items });
        })
        .catch(console.error);

      // Reset form
      setItems([{ productName: '', unit: 'عدد', quantity: 1, unitPrice: 0, discountAmount: 0, totalAmount: 0 }]);
      setInitialPayment(0);
      setTrackingCode('');
      setDiscountValue(0);
      setAdditionalCharges(0);
      setNotes('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200">
        <div>
          <h2 className="text-sm font-bold text-slate-900">ثبت فاکتور فروش و خروج کالا</h2>
          <p className="text-xs text-slate-500 mt-0.5">صدور سریع فاکتور، انتخاب یا ثبت مشتری و ثبت دریافت اولیه</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCustomerModalOpen(true)}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>مشتری جدید</span>
          </button>
          <button
            type="button"
            onClick={() => setIsProductModalOpen(true)}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 transition-colors"
          >
            <PackagePlus className="w-3.5 h-3.5" />
            <span>کالای جدید</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Invoice Meta Grid */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">خریدار (طرف حساب):</label>
          <select
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(parseInt(e.target.value, 10))}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.balance && c.balance > 0 ? `(بدهی: ${c.balance.toLocaleString('fa-IR')} تومان)` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">تاریخ صدور فاکتور (شمسی):</label>
          <input
            type="text"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">سررسید تسویه نسیه (اختیاری):</label>
          <input
            type="text"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            placeholder="مثلاً: ۱۴۰۵/۰۹/۰۱"
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Invoice Items Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800">ردیف‌های کالا و خدمات فاکتور:</span>
          <button
            type="button"
            onClick={addItemRow}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>افزودن ردیف</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right border-collapse">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3 w-10 text-center">#</th>
                <th className="py-2.5 px-3 min-w-[200px]">شرح کالا (انتخاب یا تایپ مستقیم)</th>
                <th className="py-2.5 px-3 w-28 text-center">واحد</th>
                <th className="py-2.5 px-3 w-28 text-center">تعداد / مقدار</th>
                <th className="py-2.5 px-3 w-36 text-left">قیمت واحد (تومان)</th>
                <th className="py-2.5 px-3 w-28 text-left">تخفیف ردیف</th>
                <th className="py-2.5 px-3 w-36 text-left">مبلغ کل (تومان)</th>
                <th className="py-2.5 px-3 w-12 text-center">حذف</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50">
                  <td className="py-2 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>

                  {/* Product Selector / Custom Input */}
                  <td className="py-2 px-3">
                    <div className="space-y-1">
                      <select
                        value={row.productId || ''}
                        onChange={(e) => updateItem(idx, 'productId', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs text-slate-900"
                      >
                        <option value="">-- انتخاب از کالاها یا تایپ دلخواه در زیر --</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} {typeof p.quantity === 'number' ? `(موجودی: ${p.quantity} ${p.unit || 'عدد'})` : ''}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={row.productName}
                        onChange={(e) => updateItem(idx, 'productName', e.target.value)}
                        placeholder="شرح کالا..."
                        className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-900 focus:ring-1 focus:ring-emerald-500"
                        required
                      />
                    </div>
                  </td>

                  {/* Unit */}
                  <td className="py-2 px-3 text-center">
                    <select
                      value={row.unit}
                      onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-900 text-center"
                    >
                      <option value="عدد">عدد</option>
                      <option value="کیلوگرم">کیلوگرم</option>
                      <option value="گرم">گرم</option>
                      <option value="متر">متر</option>
                      <option value="بسته">بسته</option>
                      <option value="کارتن">کارتن</option>
                      <option value="لیتر">لیتر</option>
                      <option value="ساعت">ساعت</option>
                    </select>
                  </td>

                  {/* Quantity (supports decimals e.g. 1.5) */}
                  <td className="py-2 px-3 text-center">
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      value={row.quantity}
                      onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs font-mono text-center focus:ring-1 focus:ring-emerald-500"
                    />
                  </td>

                  {/* Unit Price */}
                  <td className="py-2 px-3 text-left">
                    <input
                      type="number"
                      value={row.unitPrice || ''}
                      onChange={(e) => updateItem(idx, 'unitPrice', e.target.value)}
                      placeholder="۰"
                      className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs font-mono text-left focus:ring-1 focus:ring-emerald-500"
                    />
                  </td>

                  {/* Row Discount */}
                  <td className="py-2 px-3 text-left">
                    <input
                      type="number"
                      value={row.discountAmount || ''}
                      onChange={(e) => updateItem(idx, 'discountAmount', e.target.value)}
                      placeholder="۰"
                      className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs font-mono text-left focus:ring-1 focus:ring-emerald-500"
                    />
                  </td>

                  {/* Row Total */}
                  <td className="py-2 px-3 text-left font-mono tabular-nums font-semibold text-slate-900">
                    {formatNumberFa(row.totalAmount)}
                  </td>

                  {/* Remove Row */}
                  <td className="py-2 px-3 text-center">
                    <button
                      type="button"
                      onClick={() => removeItemRow(idx)}
                      disabled={items.length <= 1}
                      className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice Bottom & Payment Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Notes & Initial Payment */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
          <h3 className="text-xs font-bold text-slate-800 pb-2 border-b border-slate-100">
            دریافتی اولیه و تسویه هنگام ثبت فاکتور:
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-medium text-slate-700">مبلغ دریافتی نقد/پوز:</label>
                <button
                  type="button"
                  onClick={handleQuickPayFull}
                  className="text-[11px] text-emerald-700 hover:underline"
                >
                  تسویه کامل نقدی
                </button>
              </div>
              <input
                type="number"
                value={initialPayment || ''}
                onChange={(e) => setInitialPayment(parseFloat(e.target.value) || 0)}
                placeholder="۰ (نسیه کامل)"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono tabular-nums text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">روش پرداخت:</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 font-medium"
              >
                <option value="card_to_card">کارت به کارت</option>
                <option value="cash">وجه نقد</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">شماره ارجاع / پیگیری فیش بانکی:</label>
            <input
              type="text"
              value={trackingCode}
              onChange={(e) => setTrackingCode(e.target.value)}
              placeholder="اختیاری"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">توضیحات فاکتور:</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="شرایط فروش، توضیحات کالا..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900"
            />
          </div>
        </div>

        {/* Right Column: Calculations & Action Buttons */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 flex flex-col justify-between space-y-4">
          <div className="space-y-3 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>جمع ردیف‌های کالا:</span>
              <span className="font-mono tabular-nums font-semibold">{formatToman(subtotal)}</span>
            </div>

            {/* Overall Discount */}
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <span className="text-slate-600">تخفیف کلی فاکتور:</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={discountValue || ''}
                  onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                  placeholder="۰"
                  className="w-24 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-mono text-left"
                />
                <select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as any)}
                  className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs"
                >
                  <option value="amount">تومان</option>
                  <option value="percent">درصد %</option>
                </select>
              </div>
            </div>

            {/* Additional Charges */}
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-600">هزینه‌های جانبی / حمل:</span>
              <input
                type="number"
                value={additionalCharges || ''}
                onChange={(e) => setAdditionalCharges(parseFloat(e.target.value) || 0)}
                placeholder="۰"
                className="w-28 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-mono text-left"
              />
            </div>

            {/* Final Amount */}
            <div className="flex justify-between font-bold text-sm text-slate-900 pt-3 border-t-2 border-slate-200">
              <span>مبلغ نهایی قابل پرداخت:</span>
              <span className="font-mono tabular-nums text-emerald-800">{formatToman(finalTotal)}</span>
            </div>

            {/* Initial Paid Amount */}
            <div className="flex justify-between text-slate-700">
              <span>دریافت اولیه هنگام ثبت:</span>
              <span className="font-mono tabular-nums font-semibold text-blue-700">{formatToman(initialPayment)}</span>
            </div>

            {/* Remaining Due */}
            <div className="flex justify-between font-bold text-xs pt-2 border-t border-slate-200">
              <span>مانده بدهی (نسیه):</span>
              <span className={`font-mono tabular-nums ${remainingDue > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                {formatToman(remainingDue)}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              disabled={loading}
              onClick={() => handleSubmit(true)}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              <span>ذخیره پیش‌نویس</span>
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => handleSubmit(false)}
              className="flex-1 py-2.5 px-4 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" />
              <span>{loading ? 'در حال ثبت فاکتور...' : 'نهایی‌سازی فاکتور و صدور'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modals for Quick Add */}
      <CustomerModal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        onSuccess={(newCust) => {
          onRefreshData();
          if (newCust) setSelectedCustomerId(newCust.id);
        }}
      />

      <ProductModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        onSuccess={() => onRefreshData()}
      />
    </div>
  );
};
