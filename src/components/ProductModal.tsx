import React, { useState, useEffect } from 'react';
import { X, PackagePlus, Check, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Product } from '../types';
import { fetchApi } from '../lib/api';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newProduct?: Product) => void;
  productToEdit?: Product | null;
}

export const PRESET_TYPES = ['مواد غذایی'];

export const ProductModal: React.FC<ProductModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  productToEdit
}) => {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Optional fields
  const [code, setCode] = useState('');
  const [unit, setUnit] = useState('عدد');
  const [defaultSalePrice, setDefaultSalePrice] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (productToEdit) {
      setName(productToEdit.name);
      setQuantity(productToEdit.quantity?.toString() || '0');
      setCode(productToEdit.code || '');
      setUnit(productToEdit.unit || 'عدد');
      setDefaultSalePrice(productToEdit.default_sale_price?.toString() || '');
      setPurchasePrice(productToEdit.purchase_price?.toString() || '');
      setNotes(productToEdit.notes || '');
      setShowAdvanced(Boolean(productToEdit.default_sale_price || productToEdit.code || productToEdit.notes));
    } else {
      setName('');
      setQuantity('1');
      setCode('');
      setUnit('عدد');
      setDefaultSalePrice('');
      setPurchasePrice('');
      setNotes('');
      setShowAdvanced(false);
    }
    setError(null);
  }, [productToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('نام کالا الزامی است.');
      return;
    }

    setLoading(true);
    setError(null);

    const payload = {
      name: name.trim(),
      category: 'مواد غذایی',
      quantity: Math.max(0, parseFloat(quantity) || 0),
      code: code.trim() || null,
      unit: unit.trim() || 'عدد',
      default_sale_price: parseFloat(defaultSalePrice) || 0,
      purchase_price: parseFloat(purchasePrice) || 0,
      notes: notes.trim() || null
    };

    try {
      if (productToEdit) {
        await fetchApi(`/products/${productToEdit.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        onSuccess();
      } else {
        const res = await fetchApi<{ id: number; success: boolean; product?: Product }>('/products', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        onSuccess(res.product || {
          id: res.id,
          name: payload.name,
          category: payload.category,
          quantity: payload.quantity,
          code: payload.code,
          unit: payload.unit,
          default_sale_price: payload.default_sale_price,
          purchase_price: payload.purchase_price,
          notes: payload.notes,
          is_active: 1
        });
      }
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PackagePlus className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold">
              {productToEdit ? 'ویرایش کالا' : 'ثبت کالا'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* نام کالا */}
          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1">
              نام کالا: <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثلاً: برنج طارم، روغن لادن، رب گوجه، ماکارونی..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* تعداد کالا */}
          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1">
              تعداد / موجودی کالا:
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQuantity(q => String(Math.max(0, (parseFloat(q) || 0) - 1)))}
                className="w-9 h-9 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-sm transition-colors"
              >
                -
              </button>
              <input
                type="number"
                step="any"
                min="0"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="تعداد..."
                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-center text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => setQuantity(q => String((parseFloat(q) || 0) + 1))}
                className="w-9 h-9 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg text-sm transition-colors"
              >
                +
              </button>
            </div>
          </div>

          {/* Optional Advanced Settings Toggle */}
          <div className="pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1 font-medium"
            >
              <span>سایر مشخصات اختیاری (قیمت، واحد، کد کالا)</span>
              {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-3 pt-3 border-t border-slate-100 bg-slate-50 p-3 rounded-lg">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">واحد شمارش:</label>
                    <select
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-2 py-1.5 text-xs text-slate-900"
                    >
                      <option value="عدد">عدد</option>
                      <option value="بسته">بسته</option>
                      <option value="کارتن">کارتن</option>
                      <option value="کیلوگرم">کیلوگرم</option>
                      <option value="گرم">گرم</option>
                      <option value="متر">متر</option>
                      <option value="لیتر">لیتر</option>
                      <option value="دستگاه">دستگاه</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1">قیمت فروش پیش‌فرض (تومان):</label>
                    <input
                      type="number"
                      value={defaultSalePrice}
                      onChange={(e) => setDefaultSalePrice(e.target.value)}
                      placeholder="اختیاری"
                      className="w-full bg-white border border-slate-200 rounded px-2 py-1.5 text-xs font-mono text-slate-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">کد کالا یا بارکد (اختیاری):</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="اختیاری"
                    className="w-full bg-white border border-slate-200 rounded px-2 py-1.5 text-xs font-mono text-slate-900"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{loading ? 'در حال ثبت...' : 'تأیید و ذخیره کالا'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
