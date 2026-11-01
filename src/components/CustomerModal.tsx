import React, { useState, useEffect } from 'react';
import { X, UserPlus, Check, AlertCircle, Phone, MapPin, FileText } from 'lucide-react';
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
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (customerToEdit) {
      setName(customerToEdit.name || '');
      setPhone(customerToEdit.phone || '');
      setAddress(customerToEdit.address || '');
      setNotes(customerToEdit.notes || '');
    } else {
      setName('');
      setPhone('');
      setAddress('');
      setNotes('');
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

    const payload = {
      name: trimmedName,
      phone: phone.trim() || null,
      address: address.trim() || null,
      notes: notes.trim() || null
    };

    try {
      if (customerToEdit) {
        await fetchApi(`/customers/${customerToEdit.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        onSuccess();
      } else {
        const res = await fetchApi<{ id: number; success: boolean }>('/customers', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        onSuccess({
          id: res.id,
          name: trimmedName,
          phone: payload.phone,
          address: payload.address,
          notes: payload.notes,
          is_active: 1,
          created_at: new Date().toISOString()
        });
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'خطا در ثبت اطلاعات مشتری');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold">
                {customerToEdit ? 'ویرایش مشخصات مشتری' : 'افزودن مشتری جدید'}
              </h3>
              <p className="text-[11px] text-slate-400">ثبت نام، شماره تماس و اطلاعات پرونده</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Customer Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1">
              نام و نام خانوادگی مشتری: <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثلاً: علی رضایی یا حاج رضا محمدی"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all font-medium"
            />
          </div>

          {/* Customer Phone */}
          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1">
              شماره تلفن / موبایل (اختیاری):
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="مثلاً: ۰۹۱۲۳۴۵۶۷۸۹"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pr-9 pl-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all font-mono"
              />
            </div>
          </div>

          {/* Customer Address */}
          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1">
              آدرس / محل کسب (اختیاری):
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="مثلاً: بازار بزرگ، پلاک ۱۲"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pr-9 pl-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all font-medium"
              />
            </div>
          </div>

          {/* Customer Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1">
              یادداشت یا توضیحات (اختیاری):
            </label>
            <div className="relative">
              <FileText className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="توضیحات تکمیلی یا معرف مشتری..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pr-9 pl-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all font-medium"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs flex items-center gap-1.5 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{loading ? 'در حال ذخیره...' : customerToEdit ? 'به‌روزرسانی مشخصات' : 'ثبت قطعی مشتری'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
