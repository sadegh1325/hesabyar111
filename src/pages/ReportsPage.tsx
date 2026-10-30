import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  Calendar,
  CheckCircle,
  FileText
} from 'lucide-react';
import { formatToman, getTodayJalali } from '../lib/dateUtils';
import { downloadFile } from '../lib/api';

export const ReportsPage: React.FC = () => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [downloading, setDownloading] = useState(false);

  const handleDownloadExcel = async () => {
    let url = '/reports/excel';
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (params.toString()) url += `?${params.toString()}`;

    setDownloading(true);
    try {
      await downloadFile(url, 'Hesabyar_Report.xlsx');
    } catch (err: any) {
      console.warn('Excel download error:', err);
    } finally {
      setDownloading(false);
    }
  };

  const sheetsInfo = [
    { title: '۱. مشتریان', desc: 'اطلاعات کامل پرونده، تلفن، مجموع خرید و مانده حساب بدهی هر مشتری' },
    { title: '۲. فاکتورها', desc: 'فهرست فاکتورها، تاریخ صدور، سررسید، مبالغ، تخفیف، پرداخت شده و وضعیت' },
    { title: '۳. ردیف‌های فاکتورها', desc: 'شرح جزئی تک‌تک اقلام فروخته شده، تعداد، واحد و قیمت ردیف‌ها' },
    { title: '۴. پرداخت‌ها', desc: 'کلیه دریافتی‌های نقدی، کارتخوان، بانکی، تاریخ و شماره پیگیری‌ها' },
    { title: '۵. مانده حساب مشتریان', desc: 'تراز بدهکاری و بستانکاری تمام مشتریان با تفکیک فاکتورهای باز' },
    { title: '۶. گزارش فروش روزانه و ماهانه', desc: 'گردش تجمیعی فروش، وصولی و مانده نسیه به تفکیک روز' },
    { title: '۷. خلاصه مالی', desc: 'شاخص‌های کلان فروش، کل دریافتی، مانده مطالبات و تعداد اسناد' },
  ];

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200">
        <div>
          <h2 className="text-sm font-bold text-slate-900">گزارش‌های جامع و خروجی‌های استاندارد</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            تولید و دانلود فایل اکسل (XLSX) چند شیته با محاسبات کامل و سازگار با نرم‌افزارهای اداری
          </p>
        </div>
      </div>

      {/* Main Excel Export Card */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">فایل اکسل جامع فروشگاه (شامل ۷ شیت مالی)</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                تولید شده از دیتابیس واقعی، همراه با فرمول‌ها، جمع‌های کل و ستون‌های فارسی
              </p>
            </div>
          </div>

          <button
            onClick={handleDownloadExcel}
            disabled={downloading}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors shadow-xs"
          >
            <Download className="w-4 h-4" />
            <span>{downloading ? 'در حال آماده‌سازی و دانلود اکسل...' : 'دانلود فوری فایل اکسل (XLSX)'}</span>
          </button>
        </div>

        {/* Date Filter */}
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">از تاریخ (شمسی):</label>
            <input
              type="text"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              placeholder="مثلاً: ۱۴۰۵/۰۱/۰۱ (اختیاری)"
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">تا تاریخ (شمسی):</label>
            <input
              type="text"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              placeholder="مثلاً: ۱۴۰۵/۱۲/۲۹ (اختیاری)"
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-900"
            />
          </div>
        </div>

        {/* 8 Sheets breakdown */}
        <div>
          <h4 className="text-xs font-bold text-slate-800 mb-3">ساختار شیتهای موجود در فایل اکسل:</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sheetsInfo.map((s, idx) => (
              <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                <span className="font-semibold text-slate-900 block mb-1">{s.title}</span>
                <span className="text-slate-500 text-[11px] leading-relaxed block">{s.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
