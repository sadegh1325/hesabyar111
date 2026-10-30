import React, { useState, useEffect } from 'react';
import { X, UserPlus, Check, AlertCircle } from 'lucide-react';
import { Customer } from '../types';
import { fetchApi } from '../lib/api';

interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newCustomer?: Customer) => void;
  customerToEdit?: Customer | null;
}

export const CustomerModal: React.FC<CustomerModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  customerToEdit
}) => {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (customerToEdit) {
      setName(customerToEdit.name);
    } else {
      setName('');
    }
    setError(null);
  }, [customerToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('لطفاً نام و نام خانوادگی مشتری را وارد کنید.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (customerToEdit) {
        await fetchApi(`/customers/${customerToEdit.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: trimmedName })
        });
        onSuccess();
      } else {
        const res = await fetchApi<{ id: number; success: boolean }>('/customers', {
          method: 'POST',
          body: JSON.stringify({ name: trimmedName })
        });
        onSuccess({
          id: res.id,
          name: trimmedName,
          phone: null,
          address: null,
          notes: null,
          is_active: 1,
          created_at: new Date().toISOString()
        });
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'خطا در ثبت مشتری');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold">
              {customerToEdit ? 'ویرایش نام و فامیل مشتری' : 'افزودن مشتری جدید'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1.5">
              نام و نام خانوادگی مشتری:
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثلاً: علی رضایی یا حاج رضا محمدی"
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all shadow-2xs font-medium"
            />
            <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
              برای ثبت حساب و پیگیری فاکتورها، تنها نام و نام خانوادگی مشتری مورد نیاز است.
            </p>
          </div>

          <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs flex items-center gap-1.5 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{loading ? 'در حال ذخیره...' : customerToEdit ? 'به‌روزرسانی نام' : 'ثبت نام مشتری'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
