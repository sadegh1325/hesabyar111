import { toJalaali, toGregorian } from 'jalaali-js';

export const PERSIAN_MONTH_NAMES = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
];

/**
 * Returns current Persian date in format YYYY/MM/DD
 */
export function getTodayJalali(): string {
  const now = new Date();
  const j = toJalaali(now);
  const m = String(j.jm).padStart(2, '0');
  const d = String(j.jd).padStart(2, '0');
  return `${j.jy}/${m}/${d}`;
}

/**
 * Converts a Date object or ISO string to Persian date string: YYYY/MM/DD
 */
export function toJalaliString(dateInput: Date | string | number): string {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const j = toJalaali(d);
  const m = String(j.jm).padStart(2, '0');
  const day = String(j.jd).padStart(2, '0');
  return `${j.jy}/${m}/${day}`;
}

/**
 * Converts a Date object or ISO string to Persian date and time: YYYY/MM/DD - HH:MM
 */
export function toJalaliDateTimeString(dateInput: Date | string | number): string {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const j = toJalaali(d);
  const m = String(j.jm).padStart(2, '0');
  const day = String(j.jd).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${j.jy}/${m}/${day} ${hours}:${mins}`;
}

/**
 * Converts Persian date string (YYYY/MM/DD) to Gregorian ISO string
 */
export function jalaliToGregorianISO(jDateStr: string): string {
  if (!jDateStr) return new Date().toISOString();
  const parts = jDateStr.trim().split(/[/ -]/);
  if (parts.length >= 3) {
    const jy = parseInt(parts[0], 10);
    const jm = parseInt(parts[1], 10);
    const jd = parseInt(parts[2], 10);
    if (!isNaN(jy) && !isNaN(jm) && !isNaN(jd)) {
      const g = toGregorian(jy, jm, jd);
      const date = new Date(Date.UTC(g.gy, g.gm - 1, g.gd, 12, 0, 0));
      return date.toISOString();
    }
  }
  return new Date().toISOString();
}

/**
 * Format numbers in Persian/Standard comma-separated format
 */
export function formatToman(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(Number(amount))) return '۰ تومان';
  const num = Math.round(Number(amount));
  return `${num.toLocaleString('fa-IR')} تومان`;
}

/**
 * Format raw number with commas in Persian
 */
export function formatNumberFa(val: number | string | null | undefined): string {
  if (val === null || val === undefined || isNaN(Number(val))) return '۰';
  return Number(val).toLocaleString('fa-IR');
}
