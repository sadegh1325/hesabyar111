import * as XLSX from 'xlsx';
import { db } from './db.js';
import { getCustomerFinancialSummary } from './finance.js';

export function generateComprehensiveExcelReport(options?: { startDate?: string; endDate?: string }): Buffer {
  const wb = XLSX.utils.book_new();

  // 1. Customers sheet
  const customers = db.prepare(`SELECT id, name, phone, address, notes, created_at FROM customers ORDER BY id ASC`).all() as any[];
  const customersData = customers.map(c => {
    const summary = getCustomerFinancialSummary(c.id);
    return {
      'شناسه': c.id,
      'نام مشتری': c.name,
      'شماره تماس': c.phone || '-',
      'نشانی': c.address || '-',
      'مجموع خرید (تومان)': summary.totalInvoiced,
      'مجموع پرداختی (تومان)': summary.totalPaid,
      'مانده بدهی (تومان)': summary.netBalance > 0 ? summary.netBalance : 0,
      'اعتبار بستانکاری (تومان)': summary.netBalance < 0 ? Math.abs(summary.netBalance) : 0,
      'تعداد فاکتور باز': summary.openInvoicesCount,
      'تاریخ ایجاد': c.created_at
    };
  });
  const wsCustomers = XLSX.utils.json_to_sheet(customersData);
  XLSX.utils.book_append_sheet(wb, wsCustomers, 'مشتریان');

  // 2. Invoices sheet
  let invQuery = `
    SELECT i.id, i.invoice_number, i.customer_name_snapshot, i.issue_date, i.due_date,
           i.subtotal, i.discount_amount, i.additional_charges, i.final_total,
           i.paid_amount, i.remaining_amount, i.status, i.notes
    FROM invoices i
    WHERE 1=1
  `;
  const invParams: any[] = [];
  if (options?.startDate) {
    invQuery += ' AND i.issue_date >= ?';
    invParams.push(options.startDate);
  }
  if (options?.endDate) {
    invQuery += ' AND i.issue_date <= ?';
    invParams.push(options.endDate);
  }
  invQuery += ' ORDER BY i.id DESC';

  const invoices = db.prepare(invQuery).all(...invParams) as any[];
  const invoicesData = invoices.map(i => ({
    'شناسه فاکتور': i.id,
    'شماره فاکتور': i.invoice_number,
    'نام مشتری': i.customer_name_snapshot,
    'تاریخ صدور': i.issue_date,
    'تاریخ سررسید': i.due_date || '-',
    'جمع ردیف‌ها (تومان)': i.subtotal,
    'تخفیف (تومان)': i.discount_amount,
    'هزینه‌های جانبی (تومان)': i.additional_charges,
    'مبلغ نهایی (تومان)': i.final_total,
    'مبلغ پرداخت شده (تومان)': i.paid_amount,
    'مانده (تومان)': i.remaining_amount,
    'وضعیت': i.status === 'paid' ? 'تسویه شده' : i.status === 'partially_paid' ? 'پرداخت جزئی' : i.status === 'unpaid' ? 'پرداخت نشده' : i.status === 'draft' ? 'پیش‌نویس' : i.status,
    'توضیحات': i.notes || '-'
  }));
  const wsInvoices = XLSX.utils.json_to_sheet(invoicesData);
  XLSX.utils.book_append_sheet(wb, wsInvoices, 'فاکتورها');

  // 3. Invoice Items sheet
  const items = db.prepare(`
    SELECT ii.id, i.invoice_number, i.customer_name_snapshot, ii.product_name, ii.unit,
           ii.quantity, ii.unit_price, ii.discount_amount, ii.total_amount, i.issue_date
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    ORDER BY ii.id DESC
  `).all() as any[];
  const itemsData = items.map(it => ({
    'شناسه ردیف': it.id,
    'شماره فاکتور': it.invoice_number,
    'مشتری': it.customer_name_snapshot,
    'کالا / خدمت': it.product_name,
    'واحد': it.unit,
    'تعداد / مقدار': it.quantity,
    'قیمت واحد (تومان)': it.unit_price,
    'تخفیف ردیف (تومان)': it.discount_amount,
    'مبلغ کل ردیف (تومان)': it.total_amount,
    'تاریخ': it.issue_date
  }));
  const wsItems = XLSX.utils.json_to_sheet(itemsData);
  XLSX.utils.book_append_sheet(wb, wsItems, 'ردیف‌های فاکتورها');

  // 4. Payments sheet
  const payments = db.prepare(`
    SELECT p.id, c.name as customer_name, p.amount, p.payment_date, p.payment_method,
           p.tracking_code, p.notes, p.status
    FROM payments p
    JOIN customers c ON c.id = p.customer_id
    ORDER BY p.id DESC
  `).all() as any[];
  const paymentsData = payments.map(p => {
    const methodFa: Record<string, string> = {
      cash: 'نقدی',
      pos: 'دستگاه کارتخوان (POS)',
      bank_transfer: 'انتقال بانکی / پایا / کارت',
      other: 'سایر روش‌ها'
    };
    return {
      'شناسه پرداخت': p.id,
      'مشتری': p.customer_name,
      'مبلغ (تومان)': p.amount,
      'تاریخ پرداخت': p.payment_date,
      'روش پرداخت': methodFa[p.payment_method] || p.payment_method,
      'کد پیگیری': p.tracking_code || '-',
      'وضعیت': p.status === 'valid' ? 'معتبر' : p.status === 'refunded' ? 'برگشت خورده' : p.status,
      'توضیحات': p.notes || '-'
    };
  });
  const wsPayments = XLSX.utils.json_to_sheet(paymentsData);
  XLSX.utils.book_append_sheet(wb, wsPayments, 'پرداخت‌ها');

  // 5. Customer Balances sheet
  const balanceData = customers.map(c => {
    const summary = getCustomerFinancialSummary(c.id);
    return {
      'نام مشتری': c.name,
      'تلفن': c.phone || '-',
      'مجموع خریدها (تومان)': summary.totalInvoiced,
      'مجموع پرداخت‌ها (تومان)': summary.totalPaid,
      'مانده حساب (تومان)': summary.netBalance,
      'وضعیت حساب': summary.netBalance > 0 ? 'بدهکار' : summary.netBalance < 0 ? 'بستانکار' : 'تسویه',
      'فاکتورهای باز': summary.openInvoicesCount,
      'آخرین پرداخت': summary.lastPaymentDate || '-'
    };
  });
  const wsBalances = XLSX.utils.json_to_sheet(balanceData);
  XLSX.utils.book_append_sheet(wb, wsBalances, 'مانده حساب مشتریان');

  // 6. Daily and Monthly Sales
  const daily = db.prepare(`
    SELECT issue_date as date, COUNT(*) as invoice_count, SUM(final_total) as total_sales, SUM(paid_amount) as total_collected
    FROM invoices
    WHERE status != 'cancelled' AND status != 'draft'
    GROUP BY issue_date
    ORDER BY issue_date DESC
  `).all() as any[];
  const dailyData = daily.map(d => ({
    'تاریخ': d.date,
    'تعداد فاکتور': d.invoice_count,
    'فروش ناخالص (تومان)': d.total_sales,
    'دریافتی ثبت شده (تومان)': d.total_collected,
    'مانده نسیه (تومان)': d.total_sales - d.total_collected
  }));
  const wsDaily = XLSX.utils.json_to_sheet(dailyData);
  XLSX.utils.book_append_sheet(wb, wsDaily, 'گزارش فروش روزانه و ماهانه');

  // 7. Financial Summary sheet
  const totalSalesRow = db.prepare(`SELECT COALESCE(SUM(final_total), 0) as s, COALESCE(SUM(paid_amount), 0) as p, COALESCE(SUM(remaining_amount), 0) as r, COUNT(*) as c FROM invoices WHERE status != 'cancelled' AND status != 'draft'`).get() as any;
  const totalValidPayments = db.prepare(`SELECT COALESCE(SUM(amount), 0) as pay, COUNT(*) as c FROM payments WHERE status = 'valid'`).get() as any;

  const summaryData = [
    { 'عنوان شاخص مالی': 'کل مبلغ فاکتورهای صادره', 'مقدار': totalSalesRow.s },
    { 'عنوان شاخص مالی': 'کل مبالغ وصول شده (تومان)', 'مقدار': totalValidPayments.pay },
    { 'عنوان شاخص مالی': 'مجموع مطالبات وصول‌نشده (بدهی مشتریان)', 'مقدار': totalSalesRow.r },
    { 'عنوان شاخص مالی': 'تعداد کل فاکتورهای معتبر', 'مقدار': totalSalesRow.c },
    { 'عنوان شاخص مالی': 'تعداد اسناد دریافت وجه ثبت‌شده', 'مقدار': totalValidPayments.c }
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'خلاصه مالی');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
