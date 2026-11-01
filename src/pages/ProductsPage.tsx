import React, { useState } from 'react';
import {
  Package,
  Plus,
  Edit2,
  Trash2,
  Search,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Boxes,
  Layers,
  ArrowUpDown,
  Filter
} from 'lucide-react';
import { Product } from '../types';
import { formatNumberFa, formatToman } from '../lib/dateUtils';
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);

  // Quick Inline Add State (نام کالا و تعداد)
  const [quickName, setQuickName] = useState('');
  const [quickQuantity, setQuickQuantity] = useState('1');
  const [quickPrice, setQuickPrice] = useState('');
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
          default_sale_price: parseFloat(quickPrice) || 0,
          unit: 'عدد'
        })
      });

      setQuickSuccess(true);
      setQuickName('');
      setQuickQuantity('1');
      setQuickPrice('');
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

  // Inventory stats
  const totalKinds = products.length;
  const totalStockCount = products.reduce((sum, p) => sum + (p.quantity || 0), 0);
  const outOfStockCount = products.filter(p => (p.quantity ?? 0) <= 0).length;
  const lowStockCount = products.filter(p => (p.quantity ?? 0) > 0 && (p.quantity ?? 0) <= 5).length;
  const inStockCount = products.filter(p => (p.quantity ?? 0) > 0).length;

  // Filter products by search and stock status
  const filtered = products.filter(p => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.code && p.code.toLowerCase().includes(searchTerm.toLowerCase()));

    const qty = p.quantity ?? 0;
    if (!matchesSearch) return false;

    if (statusFilter === 'in_stock') return qty > 0;
    if (statusFilter === 'low_stock') return qty > 0 && qty <= 5;
    if (statusFilter === 'out_of_stock') return qty <= 0;

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Boxes className="w-5 h-5 text-emerald-600" />
            <span>مدیریت کالاها و موجودی انبار</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            کنترل دقیق موجودی کالاها، شارژ اقلام رو به اتمام و ثبت کالای جدید فروشگاه
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              setProductToEdit(null);
              setIsModalOpen(true);
            }}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shadow-xs cursor-pointer active:scale-98"
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            <span>افزودن کالای جدید</span>
          </button>
        </div>
      </div>

      {/* Inventory Stat Cards (مثل داشبورد و مشتریان) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* کل تنوع کالاها */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">تنوع اقلام</span>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-slate-900">
            {formatNumberFa(totalKinds)} <span className="text-xs font-normal text-slate-500">قلم</span>
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">تعداد ردیف کالاهای ثبت‌شده</span>
        </div>

        {/* مجموع موجودی کالاها */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-emerald-700 mb-2">
            <span className="text-xs font-medium">کل موجودی انبار</span>
            <Package className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-700">
            {formatNumberFa(totalStockCount)} <span className="text-xs font-normal text-slate-500">عدد</span>
          </div>
          <span className="text-[11px] text-emerald-600 mt-1 block">مجموع فیزیکی تمام اقلام</span>
        </div>

        {/* کالاهای رو به اتمام */}
        <div 
          onClick={() => setStatusFilter(statusFilter === 'low_stock' ? 'all' : 'low_stock')}
          className={`p-4 rounded-xl border transition-all cursor-pointer shadow-2xs ${
            statusFilter === 'low_stock'
              ? 'bg-amber-100/70 border-amber-400 ring-2 ring-amber-300'
              : 'bg-white border-slate-200 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between text-amber-700 mb-2">
            <span className="text-xs font-medium">رو به اتمام (کمتر از ۵)</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-amber-700">
            {formatNumberFa(lowStockCount)} <span className="text-xs font-normal text-slate-500">کالا</span>
          </div>
          <span className="text-[11px] text-amber-600 mt-1 block">نیازمند شارژ زودهنگام</span>
        </div>

        {/* کالاهای ناموجود */}
        <div 
          onClick={() => setStatusFilter(statusFilter === 'out_of_stock' ? 'all' : 'out_of_stock')}
          className={`p-4 rounded-xl border transition-all cursor-pointer shadow-2xs ${
            statusFilter === 'out_of_stock'
              ? 'bg-rose-100/70 border-rose-400 ring-2 ring-rose-300'
              : 'bg-white border-slate-200 hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between text-rose-700 mb-2">
            <span className="text-xs font-medium">اتمام موجودی (صفر)</span>
            <AlertCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-rose-700">
            {formatNumberFa(outOfStockCount)} <span className="text-xs font-normal text-slate-500">کالا</span>
          </div>
          <span className="text-[11px] text-rose-600 mt-1 block">فاقد موجودی در قفسه</span>
        </div>
      </div>

      {/* بخش ثبت سریع کالا با نام و تعداد */}
      <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 sm:p-5 shadow-2xs">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-md bg-emerald-600 text-white flex items-center justify-center">
            <Plus className="w-3.5 h-3.5" />
          </div>
          <h3 className="text-xs font-bold text-emerald-950">
            ثبت سریع کالا در انبار (ورود فوری بدون فرم طولانی):
          </h3>
        </div>

        {quickError && (
          <div className="p-2.5 mb-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{quickError}</span>
          </div>
        )}

        {quickSuccess && (
          <div className="p-2.5 mb-3 bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>کالا با موفقیت به انبار افزوده شد.</span>
          </div>
        )}

        <form onSubmit={handleQuickAdd} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          {/* نام کالا */}
          <div className="sm:col-span-6">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              نام کالا:
            </label>
            <input
              type="text"
              required
              value={quickName}
              onChange={(e) => setQuickName(e.target.value)}
              placeholder="مثلاً: برنج طارم، روغن لادن، قند، شکر، تن‌ماهی..."
              className="w-full bg-white border border-emerald-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
            />
          </div>

          {/* تعداد کالا */}
          <div className="sm:col-span-3">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              موجودی اولیه:
            </label>
            <input
              type="number"
              step="any"
              min="0"
              required
              value={quickQuantity}
              onChange={(e) => setQuickQuantity(e.target.value)}
              placeholder="تعداد..."
              className="w-full bg-white border border-emerald-200 rounded-xl px-3 py-2 text-center text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* قیمت فروش */}
          <div className="sm:col-span-3">
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              قیمت فروش (تومان):
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                step="any"
                min="0"
                value={quickPrice}
                onChange={(e) => setQuickPrice(e.target.value)}
                placeholder="اختیاری..."
                className="w-full bg-white border border-emerald-200 rounded-xl px-3 py-2 text-center text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="submit"
                disabled={quickLoading}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-xs disabled:opacity-50 shrink-0 cursor-pointer"
                title="ثبت کالا"
              >
                <Plus className="w-4 h-4" />
                <span>ثبت</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* جستجو و فیلترهای وضعیت */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex items-center gap-3">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="جستجوی نام کالا یا بارکد..."
            className="w-full text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="text-xs text-slate-400 hover:text-slate-600 px-2 whitespace-nowrap cursor-pointer"
            >
              پاک کردن
            </button>
          )}
        </div>

        {/* فیلترهای موجودی */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 overflow-x-auto text-xs">
          <span className="text-slate-400 text-[11px] shrink-0 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" />
            فیلتر موجودی:
          </span>
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            همه اقلام ({formatNumberFa(totalKinds)})
          </button>
          <button
            onClick={() => setStatusFilter('in_stock')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 ${
              statusFilter === 'in_stock'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            موجود در انبار ({formatNumberFa(inStockCount)})
          </button>
          <button
            onClick={() => setStatusFilter('low_stock')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 ${
              statusFilter === 'low_stock'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
            }`}
          >
            رو به اتمام ({formatNumberFa(lowStockCount)})
          </button>
          <button
            onClick={() => setStatusFilter('out_of_stock')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 ${
              statusFilter === 'out_of_stock'
                ? 'bg-rose-600 text-white shadow-2xs'
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
            }`}
          >
            اتمام موجودی ({formatNumberFa(outOfStockCount)})
          </button>
        </div>
      </div>

      {/* جدول و کارت‌های کالاها */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right border-collapse">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 w-12 text-center">#</th>
                <th className="py-3 px-4 min-w-[200px]">نام کالا</th>
                <th className="py-3 px-4 text-center min-w-[120px]">وضعیت انبار</th>
                <th className="py-3 px-4 text-center min-w-[180px]">موجودی در انبار</th>
                <th className="py-3 px-4 text-left min-w-[120px]">قیمت فروش (تومان)</th>
                <th className="py-3 px-4 text-center w-24">واحد</th>
                <th className="py-3 px-4 text-center w-24">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length > 0 ? (
                filtered.map((p, idx) => {
                  const qty = p.quantity ?? 0;
                  const isOutOfStock = qty <= 0;
                  const isLowStock = qty > 0 && qty <= 5;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 text-center font-mono text-slate-400">{idx + 1}</td>

                      {/* نام کالا */}
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        <div className="text-sm font-bold text-slate-900">{p.name}</div>
                        {p.code && (
                          <span className="text-[11px] font-mono text-slate-400 block mt-0.5">
                            کد / بارکد: {p.code}
                          </span>
                        )}
                      </td>

                      {/* برچسب وضعیت انبار */}
                      <td className="py-3.5 px-4 text-center">
                        {isOutOfStock ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                            ناموجود
                          </span>
                        ) : isLowStock ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                            رو به اتمام
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                            موجود در انبار
                          </span>
                        )}
                      </td>

                      {/* تعداد با دکمه‌های کم و زیاد کردن آنی */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1">
                          <button
                            type="button"
                            onClick={() => handleAdjustQuantity(p.id, -1)}
                            className="w-7 h-7 flex items-center justify-center bg-white hover:bg-slate-200 text-slate-800 rounded-lg text-sm font-bold transition-all shadow-2xs cursor-pointer active:scale-95"
                            title="کاهش یک عدد"
                          >
                            -
                          </button>
                          <span className={`w-14 text-center font-mono tabular-nums font-bold text-sm ${
                            isOutOfStock ? 'text-rose-600' : isLowStock ? 'text-amber-700' : 'text-slate-900'
                          }`}>
                            {formatNumberFa(qty)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAdjustQuantity(p.id, 1)}
                            className="w-7 h-7 flex items-center justify-center bg-white hover:bg-slate-200 text-slate-800 rounded-lg text-sm font-bold transition-all shadow-2xs cursor-pointer active:scale-95"
                            title="افزایش یک عدد"
                          >
                            +
                          </button>
                        </div>
                      </td>

                      {/* قیمت فروش */}
                      <td className="py-3.5 px-4 text-left font-mono tabular-nums text-slate-800 font-medium">
                        {p.default_sale_price ? formatToman(p.default_sale_price) : <span className="text-slate-400 text-[11px]">-</span>}
                      </td>

                      {/* واحد */}
                      <td className="py-3.5 px-4 text-center text-slate-600 font-medium">
                        {p.unit || 'عدد'}
                      </td>

                      {/* عملیات */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => {
                              setProductToEdit(p);
                              setIsModalOpen(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="ویرایش مشخصات کامل"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(p)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="حذف کالا"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
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
