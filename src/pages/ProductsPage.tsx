import React, { useState } from 'react';
import {
  Package,
  Plus,
  Edit2,
  Trash2,
  Search,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { Product } from '../types';
import { formatNumberFa } from '../lib/dateUtils';
import { fetchApi } from '../lib/api';
import { ProductModal } from '../components/ProductModal';

interface ProductsPageProps {
  products: Product[];
  onRefreshData: () => void;
}

export const ProductsPage: React.FC<ProductsPageProps> = ({
  products,
  onRefreshData
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);

  // Quick Inline Add State (نام کالا و تعداد)
  const [quickName, setQuickName] = useState('');
  const [quickQuantity, setQuickQuantity] = useState('1');
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickSuccess, setQuickSuccess] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);

  // Handle Quick Add
  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickName.trim()) {
      setQuickError('لطفاً نام کالا را وارد کنید.');
      return;
    }

    setQuickLoading(true);
    setQuickError(null);

    try {
      await fetchApi('/products', {
        method: 'POST',
        body: JSON.stringify({
          name: quickName.trim(),
          category: 'مواد غذایی',
          quantity: Math.max(0, parseFloat(quickQuantity) || 0),
          unit: 'عدد'
        })
      });

      setQuickSuccess(true);
      setQuickName('');
      setQuickQuantity('1');
      setTimeout(() => setQuickSuccess(false), 2500);
      onRefreshData();
    } catch (err: any) {
      setQuickError(err.message);
    } finally {
      setQuickLoading(false);
    }
  };

  // Quick In-Row Quantity Change (+1 or -1)
  const handleAdjustQuantity = async (productId: number, delta: number) => {
    try {
      await fetchApi(`/products/${productId}/quantity`, {
        method: 'PATCH',
        body: JSON.stringify({ delta })
      });
      onRefreshData();
    } catch (err: any) {
      console.warn('Could not update quantity:', err);
    }
  };

  const handleDelete = async (product: Product) => {
    if (!confirm(`آیا از حذف کالا "${product.name}" اطمینان دارید؟`)) return;
    try {
      await fetchApi(`/products/${product.id}`, { method: 'DELETE' });
      onRefreshData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Filter products by search (نام کالا یا کد)
  const filtered = products.filter(p => {
    return (
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.code && p.code.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  });

  const totalQuantity = products.reduce((sum, p) => sum + (p.quantity || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200">
        <div>
          <h2 className="text-sm font-bold text-slate-900">مدیریت کالاها</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            ثبت سریع کالا با نام کالا و کنترل موجودی اقلام مواد غذایی فروشگاه
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-2">
            <span>تعداد کل اقلام در انبار:</span>
            <span className="font-mono tabular-nums font-bold text-slate-900">{formatNumberFa(totalQuantity)}</span>
          </div>
          <button
            onClick={() => {
              setProductToEdit(null);
              setIsModalOpen(true);
            }}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            <span>فرم کامل ثبت کالا</span>
          </button>
        </div>
      </div>

      {/* بخش ثبت سریع کالا (نام و تعداد) */}
      <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-5 shadow-2xs">
        <div className="flex items-center gap-2 mb-3">
          <Package className="w-4 h-4 text-emerald-700" />
          <h3 className="text-xs font-bold text-emerald-950">
            ثبت سریع کالا (نام کالا و تعداد موجودی):
          </h3>
        </div>

        {quickError && (
          <div className="p-2.5 mb-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{quickError}</span>
          </div>
        )}

        {quickSuccess && (
          <div className="p-2.5 mb-3 bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs rounded-lg flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>کالا با موفقیت به انبار اضافه شد.</span>
          </div>
        )}

        <form onSubmit={handleQuickAdd} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          {/* اسم کالا */}
          <div className="sm:col-span-8">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              نام کالا:
            </label>
            <input
              type="text"
              required
              value={quickName}
              onChange={(e) => setQuickName(e.target.value)}
              placeholder="مثلاً: برنج طارم محلی، روغن مایع لادن، رب گوجه‌فرنگی، شکر، چای..."
              className="w-full bg-white border border-emerald-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* تعداد کالا */}
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              تعداد موجودی:
            </label>
            <input
              type="number"
              step="any"
              min="0"
              required
              value={quickQuantity}
              onChange={(e) => setQuickQuantity(e.target.value)}
              placeholder="تعداد..."
              className="w-full bg-white border border-emerald-200 rounded-lg px-3 py-2 text-center text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* دکمه ثبت */}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={quickLoading}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-xs disabled:opacity-50"
              title="ثبت کالا"
            >
              <Plus className="w-4 h-4" />
              <span>افزودن کالا</span>
            </button>
          </div>
        </form>
      </div>

      {/* جستجو کالا */}
      <div className="bg-white p-4 rounded-xl border border-slate-200">
        <div className="flex items-center gap-3">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="جستجوی نام کالا..."
            className="w-full text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="text-xs text-slate-400 hover:text-slate-600 px-2 whitespace-nowrap">
              پاک کردن
            </button>
          )}
        </div>
      </div>

      {/* جدول کالاها */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right border-collapse">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 w-12 text-center">#</th>
                <th className="py-3 px-4 min-w-[240px]">نام کالا</th>
                <th className="py-3 px-4 text-center w-48">تعداد موجودی</th>
                <th className="py-3 px-4 text-center w-24">واحد</th>
                <th className="py-3 px-4 text-center w-28">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length > 0 ? (
                filtered.map((p, idx) => (
                  <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 text-center font-mono text-slate-400">{idx + 1}</td>
                    
                    {/* نام کالا */}
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {p.name}
                      {p.code && (
                        <span className="block text-[11px] font-mono text-slate-400 font-normal">
                          کد: {p.code}
                        </span>
                      )}
                    </td>

                    {/* تعداد کالا با دکمه‌های کم و زیاد کردن فوری */}
                    <td className="py-3 px-4 text-center">
                      <div className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-1">
                        <button
                          type="button"
                          onClick={() => handleAdjustQuantity(p.id, -1)}
                          className="w-6 h-6 flex items-center justify-center bg-white hover:bg-slate-200 text-slate-700 rounded text-xs font-bold transition-colors shadow-2xs"
                          title="کاهش یک عدد"
                        >
                          -
                        </button>
                        <span className="w-14 text-center font-mono tabular-nums font-bold text-slate-900 text-sm">
                          {formatNumberFa(p.quantity ?? 0)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAdjustQuantity(p.id, 1)}
                          className="w-6 h-6 flex items-center justify-center bg-white hover:bg-slate-200 text-slate-700 rounded text-xs font-bold transition-colors shadow-2xs"
                          title="افزایش یک عدد"
                        >
                          +
                        </button>
                      </div>
                    </td>

                    {/* واحد */}
                    <td className="py-3 px-4 text-center text-slate-600 font-medium">
                      {p.unit || 'عدد'}
                    </td>

                    {/* عملیات */}
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => {
                            setProductToEdit(p);
                            setIsModalOpen(true);
                          }}
                          className="p-1.5 text-slate-500 hover:text-slate-800 rounded-md transition-colors"
                          title="ویرایش کالا"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(p)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md transition-colors"
                          title="حذف کالا"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    کالایی با این مشخصات یافت نشد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ProductModal
        isOpen={isModalOpen}
        productToEdit={productToEdit}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => onRefreshData()}
      />
    </div>
  );
};
