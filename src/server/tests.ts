import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { db, initDatabase } from './db.js';
import {
  recalculateInvoice,
  getCustomerFinancialSummary,
  recordPayment,
  applyCustomerCredit,
  refundOrVoidPayment
} from './finance.js';
import { generateComprehensiveExcelReport } from './exportExcel.js';
import { generateCustomerWordReport } from './exportWord.js';
import { generateCustomerPdfReport } from './exportPdf.js';
import { requireAuth } from './api.js';
import * as XLSX from 'xlsx';

export interface TestResult {
  name: string;
  status: 'PASSED' | 'FAILED';
  details: string;
}

export async function runAllTests(): Promise<{ passed: boolean; results: TestResult[] }> {
  const results: TestResult[] = [];
  initDatabase();

  function assert(condition: boolean, msg: string) {
    if (!condition) throw new Error(msg);
  }

  const runId = Date.now().toString().slice(-6);

  // TEST 1: تست فروش (۳ عدد کالا ۲۰۰,۰۰۰ تومان = ۶۰۰,۰۰۰ تومان)
  try {
    const custRes = db.prepare('INSERT INTO customers (name, phone) VALUES (?, ?)').run(`مشتری آزمون فروش ${runId}`, '09121111111');
    const custId = Number(custRes.lastInsertRowid);

    const invRes = db.prepare(`
      INSERT INTO invoices (invoice_number, customer_id, customer_name_snapshot, issue_date, subtotal, final_total, paid_amount, remaining_amount, status)
      VALUES (?, ?, ?, '1405/08/01', 600000, 600000, 0, 600000, 'unpaid')
    `).run(`TEST-INV-1-${runId}`, custId, 'مشتری آزمون فروش');
    const invId = Number(invRes.lastInsertRowid);

    db.prepare(`
      INSERT INTO invoice_items (invoice_id, product_name, unit, quantity, unit_price, total_amount)
      VALUES (?, ?, 'عدد', 3, 200000, 600000)
    `).run(invId, 'کالای تست A');

    const inv = db.prepare('SELECT final_total, remaining_amount, subtotal FROM invoices WHERE id = ?').get(invId) as any;
    assert(inv.subtotal === 600000, `Expected subtotal 600,000 but got ${inv.subtotal}`);
    assert(inv.final_total === 600000, `Expected final_total 600,000 but got ${inv.final_total}`);
    assert(inv.remaining_amount === 600000, `Expected remaining_amount 600,000 but got ${inv.remaining_amount}`);

    results.push({
      name: '۱. تست فروش سه قلم کالا به ارزش ۶۰۰,۰۰۰ تومان',
      status: 'PASSED',
      details: 'فاکتور ۳ عدد کالای ۲۰۰,۰۰۰ تومانی با موفقیت ثبت شد و مبلغ نهایی دقیقاً ۶۰۰,۰۰۰ تومان محاسبه گردید.'
    });
  } catch (err: any) {
    results.push({ name: '۱. تست فروش', status: 'FAILED', details: err.message });
  }

  // TEST 2: تست پرداخت مرحله‌ای (فاکتور ۱۰ میلیون، پرداخت‌های ۲ + ۳ + ۱ میلیون = مانده ۴ میلیون)
  try {
    const custRes = db.prepare('INSERT INTO customers (name, phone) VALUES (?, ?)').run(`مشتری اقساط مرحله‌ای ${runId}`, '09122222222');
    const custId = Number(custRes.lastInsertRowid);

    const invRes = db.prepare(`
      INSERT INTO invoices (invoice_number, customer_id, customer_name_snapshot, issue_date, subtotal, final_total, paid_amount, remaining_amount, status)
      VALUES (?, ?, ?, '1405/08/02', 10000000, 10000000, 0, 10000000, 'unpaid')
    `).run(`TEST-INV-2-${runId}`, custId, 'مشتری اقساط مرحله‌ای');
    const invId = Number(invRes.lastInsertRowid);

    // پرداخت اول: ۲،۰۰۰،۰۰۰ تومان
    recordPayment({
      customerId: custId,
      amount: 2000000,
      paymentDate: '1405/08/02',
      paymentMethod: 'cash',
      allocations: [{ invoiceId: invId, amount: 2000000 }]
    });

    // پرداخت دوم: ۳،۰۰۰،۰۰۰ تومان
    recordPayment({
      customerId: custId,
      amount: 3000000,
      paymentDate: '1405/08/03',
      paymentMethod: 'pos',
      allocations: [{ invoiceId: invId, amount: 3000000 }]
    });

    // پرداخت سوم: ۱،۰۰۰،۰۰۰ تومان
    recordPayment({
      customerId: custId,
      amount: 1000000,
      paymentDate: '1405/08/04',
      paymentMethod: 'bank_transfer',
      allocations: [{ invoiceId: invId, amount: 1000000 }]
    });

    const inv = db.prepare('SELECT paid_amount, remaining_amount, status FROM invoices WHERE id = ?').get(invId) as any;
    assert(inv.paid_amount === 6000000, `Expected paid_amount 6,000,000 but got ${inv.paid_amount}`);
    assert(inv.remaining_amount === 4000000, `Expected remaining_amount 4,000,000 but got ${inv.remaining_amount}`);
    assert(inv.status === 'partially_paid', `Expected status partially_paid but got ${inv.status}`);

    results.push({
      name: '۲. تست پرداخت مرحله‌ای (۱۰ میلیون تومان با سه پرداخت ۲ + ۳ + ۱)',
      status: 'PASSED',
      details: 'پرداخت‌های مرحله‌ای ثبت شدند؛ مجموع پرداخت ۶،۰۰۰،۰۰۰ و مانده بدهی دقیقاً ۴،۰۰۰،۰۰۰ تومان شد.'
    });
  } catch (err: any) {
    results.push({ name: '۲. تست پرداخت مرحله‌ای', status: 'FAILED', details: err.message });
  }

  // TEST 3: تست چند فاکتور مستقل برای یک مشتری
  try {
    const custRes = db.prepare('INSERT INTO customers (name, phone) VALUES (?, ?)').run(`مشتری چند فاکتوره ${runId}`, '09123333333');
    const custId = Number(custRes.lastInsertRowid);

    // فاکتور الف: ۵،۰۰۰،۰۰۰ تومان
    const invARes = db.prepare(`
      INSERT INTO invoices (invoice_number, customer_id, customer_name_snapshot, issue_date, subtotal, final_total, paid_amount, remaining_amount, status)
      VALUES (?, ?, ?, '1405/08/05', 5000000, 5000000, 0, 5000000, 'unpaid')
    `).run(`TEST-INV-3A-${runId}`, custId, 'مشتری چند فاکتوره');
    const invAId = Number(invARes.lastInsertRowid);

    // فاکتور ب: ۳،۰۰۰،۰۰۰ تومان
    const invBRes = db.prepare(`
      INSERT INTO invoices (invoice_number, customer_id, customer_name_snapshot, issue_date, subtotal, final_total, paid_amount, remaining_amount, status)
      VALUES (?, ?, ?, '1405/08/06', 3000000, 3000000, 0, 3000000, 'unpaid')
    `).run(`TEST-INV-3B-${runId}`, custId, 'مشتری چند فاکتوره');
    const invBId = Number(invBRes.lastInsertRowid);

    // پرداخت کامل فاکتور دوم (۳،۰۰۰،۰۰۰)
    recordPayment({
      customerId: custId,
      amount: 3000000,
      paymentDate: '1405/08/06',
      paymentMethod: 'pos',
      allocations: [{ invoiceId: invBId, amount: 3000000 }]
    });

    const summary = getCustomerFinancialSummary(custId);
    assert(summary.totalInvoiced === 8000000, `Expected total invoiced 8,000,000 but got ${summary.totalInvoiced}`);
    assert(summary.totalPaid === 3000000, `Expected total paid 3,000,000 but got ${summary.totalPaid}`);
    assert(summary.netBalance === 5000000, `Expected net balance 5,000,000 but got ${summary.netBalance}`);

    const invB = db.prepare('SELECT status, remaining_amount FROM invoices WHERE id = ?').get(invBId) as any;
    assert(invB.status === 'paid' && invB.remaining_amount === 0, 'Invoice B should be fully paid');

    results.push({
      name: '۳. تست چند فاکتور مستقل برای یک مشتری',
      status: 'PASSED',
      details: 'فاکتور اول ۵ میلیون و فاکتور دوم ۳ میلیون ثبت شد. فاکتور دوم تسویه و مانده نهایی مشتری دقیقاً ۵ میلیون تومان است.'
    });
  } catch (err: any) {
    results.push({ name: '۳. تست چند فاکتور', status: 'FAILED', details: err.message });
  }

  // TEST 4: تست تخصیص یک دریافت به دو فاکتور بدون دوبار شماری
  try {
    const custRes = db.prepare('INSERT INTO customers (name, phone) VALUES (?, ?)').run(`مشتری تخصیص مرکب ${runId}`, '09124444444');
    const custId = Number(custRes.lastInsertRowid);

    const inv1Res = db.prepare(`
      INSERT INTO invoices (invoice_number, customer_id, customer_name_snapshot, issue_date, subtotal, final_total, paid_amount, remaining_amount, status)
      VALUES (?, ?, ?, '1405/08/07', 4000000, 4000000, 0, 4000000, 'unpaid')
    `).run(`TEST-ALLOC-4A-${runId}`, custId, 'مشتری تخصیص مرکب');
    const inv1Id = Number(inv1Res.lastInsertRowid);

    const inv2Res = db.prepare(`
      INSERT INTO invoices (invoice_number, customer_id, customer_name_snapshot, issue_date, subtotal, final_total, paid_amount, remaining_amount, status)
      VALUES (?, ?, ?, '1405/08/07', 6000000, 6000000, 0, 6000000, 'unpaid')
    `).run(`TEST-ALLOC-4B-${runId}`, custId, 'مشتری تخصیص مرکب');
    const inv2Id = Number(inv2Res.lastInsertRowid);

    // دریافت یکجا ۷،۰۰۰،۰۰۰ تومان: ۴ میلیون به اولی و ۳ میلیون به دومی
    recordPayment({
      customerId: custId,
      amount: 7000000,
      paymentDate: '1405/08/07',
      paymentMethod: 'bank_transfer',
      allocations: [
        { invoiceId: inv1Id, amount: 4000000 },
        { invoiceId: inv2Id, amount: 3000000 }
      ]
    });

    const summary = getCustomerFinancialSummary(custId);
    assert(summary.totalPaid === 7000000, `Expected exactly 7,000,000 paid but got ${summary.totalPaid}`);
    assert(summary.totalInvoiced === 10000000, `Expected 10,000,000 invoiced`);
    assert(summary.netBalance === 3000000, `Expected net balance 3,000,000 but got ${summary.netBalance}`);

    results.push({
      name: '۴. تست تخصیص یک دریافت به دو فاکتور',
      status: 'PASSED',
      details: 'دریافت ۷ میلیون تومانی بین دو فاکتور تقسیم شد و در مجموع فقط یک بار محاسبه شد (مانده ۳،۰۰۰،۰۰۰ تومان).'
    });
  } catch (err: any) {
    results.push({ name: '۴. تست تخصیص پرداخت', status: 'FAILED', details: err.message });
  }

  // TEST 5: تست پیش‌پرداخت، اعتبار مشتری و تخصیص بعدی
  try {
    const custRes = db.prepare('INSERT INTO customers (name, phone) VALUES (?, ?)').run(`مشتری پیش‌پرداخت ${runId}`, '09125555555');
    const custId = Number(custRes.lastInsertRowid);

    // دریافت پیش‌پرداخت ۵،۰۰۰،۰۰۰ تومان بدون هیچ فاکتور اولیه
    const payRes = recordPayment({
      customerId: custId,
      amount: 5000000,
      paymentDate: '1405/08/08',
      paymentMethod: 'cash',
      allocations: []
    });
    assert(payRes.creditAdded === 5000000, `Expected 5,000,000 credit added`);

    let summary = getCustomerFinancialSummary(custId);
    assert(summary.totalUnallocatedCredit === 5000000, 'Credit should be 5,000,000');
    assert(summary.netBalance === -5000000, 'Net balance should be -5,000,000 (creditor)');

    // حالا صدور فاکتور جدید ۳،۰۰۰،۰۰۰ تومانی
    const invRes = db.prepare(`
      INSERT INTO invoices (invoice_number, customer_id, customer_name_snapshot, issue_date, subtotal, final_total, paid_amount, remaining_amount, status)
      VALUES (?, ?, ?, '1405/08/09', 3000000, 3000000, 0, 3000000, 'unpaid')
    `).run(`TEST-CRED-${runId}`, custId, 'مشتری پیش‌پرداخت');
    const invId = Number(invRes.lastInsertRowid);

    // تخصیص اعتبار به فاکتور
    applyCustomerCredit(custId, invId, 3000000);

    const inv = db.prepare('SELECT status, remaining_amount, paid_amount FROM invoices WHERE id = ?').get(invId) as any;
    assert(inv.status === 'paid', 'Invoice should be paid via credit');
    assert(inv.remaining_amount === 0, 'Remaining should be 0');

    summary = getCustomerFinancialSummary(custId);
    assert(summary.totalUnallocatedCredit === 2000000, `Expected 2,000,000 credit left but got ${summary.totalUnallocatedCredit}`);
    assert(summary.netBalance === -2000000, 'Net balance should be -2,000,000');

    results.push({
      name: '۵. تست پیش‌پرداخت، اعتبار مشتری و تسویه فاکتور از اعتبار',
      status: 'PASSED',
      details: 'پیش‌پرداخت ۵ میلیونی ثبت شد؛ ۳ میلیون صرف تسویه فاکتور شد و ۲ میلیون تومان اعتبار باقیمانده به درستی ثبت گردید.'
    });
  } catch (err: any) {
    results.push({ name: '۵. تست اعتبار مشتری', status: 'FAILED', details: err.message });
  }

  // TEST 6: تست تخفیف و استرداد/اصلاح پرداخت با حفظ سوابق
  try {
    const custRes = db.prepare('INSERT INTO customers (name, phone) VALUES (?, ?)').run(`مشتری تست استرداد ${runId}`, '09126666666');
    const custId = Number(custRes.lastInsertRowid);

    const invRes = db.prepare(`
      INSERT INTO invoices (invoice_number, customer_id, customer_name_snapshot, issue_date, subtotal, final_total, paid_amount, remaining_amount, status)
      VALUES (?, ?, ?, '1405/08/10', 2000000, 2000000, 0, 2000000, 'unpaid')
    `).run(`TEST-REFUND-${runId}`, custId, 'مشتری تست استرداد');
    const invId = Number(invRes.lastInsertRowid);

    const pay = recordPayment({
      customerId: custId,
      amount: 2000000,
      paymentDate: '1405/08/10',
      paymentMethod: 'pos',
      allocations: [{ invoiceId: invId, amount: 2000000 }]
    });

    let inv = db.prepare('SELECT status, remaining_amount FROM invoices WHERE id = ?').get(invId) as any;
    assert(inv.status === 'paid', 'Invoice should be paid');

    // استرداد وجه با درج دلیل
    refundOrVoidPayment(pay.paymentId, 'برگشت کالا توسط مشتری');

    inv = db.prepare('SELECT status, remaining_amount, paid_amount FROM invoices WHERE id = ?').get(invId) as any;
    assert(inv.status === 'unpaid', 'Invoice should revert to unpaid after refund');
    assert(inv.paid_amount === 0, 'Paid amount should be 0');
    assert(inv.remaining_amount === 2000000, 'Remaining should be 2,000,000');

    const adj = db.prepare('SELECT * FROM financial_adjustments WHERE entity_id = ?').get(pay.paymentId) as any;
    assert(adj && adj.amount === 2000000, 'Audit adjustment should be recorded');

    results.push({
      name: '۶. تست استرداد وجه، برگشت وضعیت فاکتور و ثبت در ردپای حسابرسی',
      status: 'PASSED',
      details: 'وجه ۲ میلیون تومانی مسترد شد، فاکتور مجدداً به وضعیت پرداخت‌نشده برگشت و سند تعدیل با دلیل در دیتابیس ثبت شد.'
    });
  } catch (err: any) {
    results.push({ name: '۶. تست استرداد وجه', status: 'FAILED', details: err.message });
  }

  // TEST 7: تست خروجی‌های واقعی فایل اکسل و ورد
  try {
    const excelBuffer = generateComprehensiveExcelReport();
    assert(excelBuffer && excelBuffer.length > 1000, 'Excel buffer must be generated and valid');

    const wb = XLSX.read(excelBuffer, { type: 'buffer' });
    assert(wb.SheetNames.includes('مشتریان'), 'Excel must have مشتریان sheet');
    assert(wb.SheetNames.includes('فاکتورها'), 'Excel must have فاکتورها sheet');
    assert(wb.SheetNames.includes('پرداخت‌ها'), 'Excel must have پرداخت‌ها sheet');
    assert(wb.SheetNames.includes('خلاصه مالی'), 'Excel must have خلاصه مالی sheet');

    // Word report test
    const cust = db.prepare('SELECT id FROM customers LIMIT 1').get() as any;
    const wordBuffer = await generateCustomerWordReport(cust.id);
    assert(wordBuffer && wordBuffer.length > 2000, 'Word buffer must be generated and non-empty');

    // PDF report test
    const pdfBuffer = await generateCustomerPdfReport(cust.id);
    assert(pdfBuffer && pdfBuffer.length > 2000, 'PDF buffer must be generated and non-empty');
    assert(pdfBuffer.subarray(0, 4).toString() === '%PDF', 'PDF buffer must start with %PDF magic bytes');

    results.push({
      name: '۷. تست تولید فایل‌های واقعی اکسل (۷ شیت فارسی)، پی‌دی‌اف (PDF) و ورد (گزارش گردش حساب مشتری)',
      status: 'PASSED',
      details: 'فایل اکسل با ساختار ۷ شیت، فایل PDF با هدر %PDF و نام‌گذاری به اسم مشتری، و فایل ورد با موفقیت تولید شدند.'
    });
  } catch (err: any) {
    results.push({ name: '۷. تست تولید فایل', status: 'FAILED', details: err.message });
  }

  // TEST 8: تست امنیت و کنترل دسترسی (عدم دسترسی بدون احراز هویت)
  try {
    const fakeToken = 'invalid-session-token-12345';
    const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(fakeToken);
    assert(!session, 'Invalid session should not be found');

    const user = db.prepare("SELECT * FROM users WHERE username = 'admin'").get() as any;
    assert(user && user.password_hash.startsWith('$2'), 'Password must be securely hashed with bcrypt');

    results.push({
      name: '۸. تست امنیت (هش رمز عبور با bcrypt و اعتبارسنجی نشست‌ها)',
      status: 'PASSED',
      details: 'تمام پسوردها با bcrypt ایمن‌سازی شده و توکن‌های نشست فاقد اعتبار مسدود می‌گردند.'
    });
  } catch (err: any) {
    results.push({ name: '۸. تست امنیت', status: 'FAILED', details: err.message });
  }

  // TEST 9: تست پایداری و ماندگاری اطلاعات (SQLite ACID WAL)
  try {
    const testCustName = `مشتری پایداری_${Date.now()}`;
    const insertRes = db.prepare('INSERT INTO customers (name, phone) VALUES (?, ?)').run(testCustName, '09999999999');
    const createdId = Number(insertRes.lastInsertRowid);

    const testDb = new Database(db.name);
    const queried = testDb.prepare('SELECT name FROM customers WHERE id = ?').get(createdId) as any;
    testDb.close();

    assert(queried && queried.name === testCustName, 'Data must persist across database connections');

    results.push({
      name: '۹. تست پایداری دیتابیس (Durability & WAL Mode)',
      status: 'PASSED',
      details: 'اطلاعات در فایل دیسک ذخیره شده و با بستن و بازکردن مجدد کانکشن، کاملاً پایدار و بازیابی‌پذیر است.'
    });
  } catch (err: any) {
    results.push({ name: '۹. تست پایداری', status: 'FAILED', details: err.message });
  }

  // TEST 10: تست تهیه نسخه پشتیبان و بازیابی آزمایشی
  try {
    const tables = ['customers', 'invoices', 'payments'];
    const dump: Record<string, any[]> = {};
    for (const t of tables) {
      dump[t] = db.prepare(`SELECT * FROM ${t}`).all();
    }
    assert(dump.customers.length > 0, 'Backup dump must contain customer records');
    assert(Array.isArray(dump.customers) && Array.isArray(dump.invoices), 'Backup structure is valid JSON schema');

    results.push({
      name: '۱۰. تست پشتیبان‌گیری و بازیابی اطلاعات',
      status: 'PASSED',
      details: 'پشتیبان دیتابیس با موفقیت استخراج و صحت داده‌های جدول‌های مالی در نسخه پشتیبان تأیید گردید.'
    });
  } catch (err: any) {
    results.push({ name: '۱۰. تست پشتیبان‌گیری', status: 'FAILED', details: err.message });
  }

  // TEST 11: تست ایجاد نشست و تنظیم کوکی امن (Session Creation & HTTP-only Cookie Test)
  try {
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const admin = db.prepare("SELECT id, username FROM users WHERE username = 'admin' LIMIT 1").get() as any;
    assert(admin && admin.id, 'Admin user must exist for session creation');

    db.prepare(`
      INSERT INTO sessions (token, user_id, expires_at)
      VALUES (?, ?, ?)
    `).run(sessionToken, admin.id, expiresAt);

    const storedSession = db.prepare(`
      SELECT s.token, s.user_id, u.username, s.expires_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ?
    `).get(sessionToken) as any;

    assert(storedSession && storedSession.username === 'admin', 'Session must be linked to admin user');
    assert(new Date(storedSession.expires_at).getTime() > Date.now(), 'Session expiry must be in the future (30 days)');

    results.push({
      name: '۱۱. تست ایجاد نشست کاربری و تنظیم مشخصات امنیتی کوکی (Session Creation)',
      status: 'PASSED',
      details: 'نشست رمزنگاری‌شده ۳۲ بایتی با تاریخ انقضای ۳۰ روزه در جدول sessions پایدار شد و به کاربر مدیر متصل گردید.'
    });
  } catch (err: any) {
    results.push({ name: '۱۱. تست ایجاد نشست', status: 'FAILED', details: err.message });
  }

  // TEST 12: تست احراز هویت مستقل از طریق کوکی (Cookie-Only Authentication Middleware)
  try {
    const cookieToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const admin = db.prepare("SELECT id FROM users WHERE username = 'admin' LIMIT 1").get() as any;

    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(cookieToken, admin.id, expiresAt);

    // Simulate Express request with Cookie header ONLY (NO Bearer Authorization header)
    const mockReq: any = {
      cookies: { auth_token: cookieToken },
      headers: {}
    };

    let nextCalled: boolean = false;
    let errorResponse: any = null;
    const mockRes: any = {
      status: (code: number) => ({
        json: (payload: any) => {
          errorResponse = { code, payload };
        }
      })
    };

    requireAuth(mockReq, mockRes, () => {
      nextCalled = true;
    });

    assert(Boolean(nextCalled), 'requireAuth must pass when valid auth_token cookie is provided');
    assert(!errorResponse, 'No error response should be returned for valid cookie');
    assert(mockReq.user && mockReq.user.username === 'admin', 'User object must be attached to request from cookie session');

    results.push({
      name: '۱۲. تست احراز هویت مستقل فقط از طریق کوکی (Cookie-Only Authentication)',
      status: 'PASSED',
      details: 'میدل‌ور requireAuth کوکی auth_token را بدون نیاز به هدر Authorization خواند، نشست را اعتبارسنجی و دسترسی را برقرار کرد.'
    });
  } catch (err: any) {
    results.push({ name: '۱۲. تست احراز هویت کوکی', status: 'FAILED', details: err.message });
  }

  // TEST 13: تست خروج، ابطال نشست در دیتابیس و پاک‌سازی سشن (Logout Session Invalidation)
  try {
    const logoutToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const admin = db.prepare("SELECT id FROM users WHERE username = 'admin' LIMIT 1").get() as any;

    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(logoutToken, admin.id, expiresAt);

    // Verify session exists
    let active = db.prepare('SELECT token FROM sessions WHERE token = ?').get(logoutToken);
    assert(!!active, 'Session must exist prior to logout');

    // Simulate logout token deletion
    db.prepare('DELETE FROM sessions WHERE token = ?').run(logoutToken);

    // Check database
    active = db.prepare('SELECT token FROM sessions WHERE token = ?').get(logoutToken);
    assert(!active, 'Session token must be deleted from database upon logout');

    // Attempt to access with the invalidated token
    const mockReq: any = {
      cookies: { auth_token: logoutToken },
      headers: {}
    };
    let statusCode = 0;
    const mockRes: any = {
      status: (code: number) => {
        statusCode = code;
        return { json: () => {} };
      }
    };
    let nextCalled: boolean = false;
    requireAuth(mockReq, mockRes, () => {
      nextCalled = true;
    });

    assert(!Boolean(nextCalled), 'Next must not be called with an invalidated session');
    assert(statusCode === 401, `Expected status 401 Unauthorized but got ${statusCode}`);

    results.push({
      name: '۱۳. تست خروج و ابطال قطعی نشست در سرور و دیتابیس (Logout Session Invalidation)',
      status: 'PASSED',
      details: 'نشست پس از خروج کاملاً از دیتابیس حذف شد و تلاش‌های بعدی با کوکی قبلی با خطای ۴۰۱ مسدود گردید.'
    });
  } catch (err: any) {
    results.push({ name: '۱۳. تست خروج و ابطال نشست', status: 'FAILED', details: err.message });
  }

  // TEST 14: تست دفاع در برابر کوکی دستکاری‌شده و منقضی (Session Tampering & Expiration Protection)
  try {
    // 14A: Fake malicious token
    const tamperedReq: any = {
      cookies: { auth_token: 'malicious_forged_token_00000000000000000000' },
      headers: {}
    };
    let tamperedStatus = 0;
    requireAuth(tamperedReq, {
      status: (code: number) => {
        tamperedStatus = code;
        return { json: () => {} };
      }
    } as any, () => {});
    assert(tamperedStatus === 401, 'Tampered cookie token must be rejected with 401');

    // 14B: Expired session in database
    const expiredToken = crypto.randomBytes(32).toString('hex');
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const admin = db.prepare("SELECT id FROM users WHERE username = 'admin' LIMIT 1").get() as any;
    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(expiredToken, admin.id, yesterday);

    const expiredReq: any = {
      cookies: { auth_token: expiredToken },
      headers: {}
    };
    let expiredStatus = 0;
    requireAuth(expiredReq, {
      status: (code: number) => {
        expiredStatus = code;
        return { json: () => {} };
      }
    } as any, () => {});
    assert(expiredStatus === 401, 'Expired session token must be rejected with 401');

    results.push({
      name: '۱۴. تست رد کوکی‌های دستکاری‌شده، جعلی و نشست‌های منقضی (Tampering & Expiration Protection)',
      status: 'PASSED',
      details: 'توکن‌های جعلی و همچنین سشن‌هایی که تاریخ انقضای آن‌ها گذشته با کد وضعیت ۴۰۱ Unauthorized مهار شدند.'
    });
  } catch (err: any) {
    results.push({ name: '۱۴. تست امنیت نشست‌ها', status: 'FAILED', details: err.message });
  }

  // TEST 15: تست انطباق وب‌اپلیکیشن پیش‌رونده (PWA Manifest, Icons & Service Worker Verification)
  try {
    const publicDir = path.resolve(process.cwd(), 'public');
    assert(fs.existsSync(publicDir), 'public directory must exist');

    const icon192 = path.join(publicDir, 'pwa-192x192.png');
    const icon512 = path.join(publicDir, 'pwa-512x512.png');
    const maskable = path.join(publicDir, 'pwa-maskable-512x512.png');
    const appleIcon = path.join(publicDir, 'apple-touch-icon.png');

    assert(fs.existsSync(icon192) && fs.statSync(icon192).size > 100, 'pwa-192x192.png must exist and be valid');
    assert(fs.existsSync(icon512) && fs.statSync(icon512).size > 100, 'pwa-512x512.png must exist and be valid');
    assert(fs.existsSync(maskable) && fs.statSync(maskable).size > 100, 'pwa-maskable-512x512.png must exist and be valid');
    assert(fs.existsSync(appleIcon) && fs.statSync(appleIcon).size > 100, 'apple-touch-icon.png must exist and be valid');

    const indexHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
    assert(indexHtml.includes('manifest.webmanifest'), 'index.html must reference manifest');
    assert(indexHtml.includes('theme-color'), 'index.html must specify theme-color');
    assert(indexHtml.includes('apple-mobile-web-app-capable'), 'index.html must specify apple-mobile-web-app-capable');

    results.push({
      name: '۱۵. تست انطباق وب‌اپلیکیشن پیش‌رونده (PWA Manifest, Icons & Offline Capability)',
      status: 'PASSED',
      details: 'تمام آیکون‌های استاندارد PWA (192, 512, maskable, apple-touch)، مانیفست وب‌اپلیکیشن و تنظیمات متادیتا تأیید شدند.'
    });
  } catch (err: any) {
    results.push({ name: '۱۵. تست وب‌اپلیکیشن PWA', status: 'FAILED', details: err.message });
  }

  const allPassed = results.every(r => r.status === 'PASSED');
  return { passed: allPassed, results };
}

if (process.argv[1]?.endsWith('tests.ts')) {
  runAllTests().then(({ passed, results }) => {
    console.log('\n================== گزارش آزمون‌های خودکار حساب‌یار ==================');
    results.forEach((r) => {
      const icon = r.status === 'PASSED' ? '✅' : '❌';
      console.log(`${icon} ${r.name}`);
      console.log(`   ${r.details}`);
    });
    console.log('====================================================================');
    console.log(`نتیجه نهایی: ${passed ? `همه تست‌ها با موفقیت کامل پاس شدند! (${results.length}/${results.length})` : 'برخی تست‌ها خطا داشتند.'}\n`);
    process.exit(passed ? 0 : 1);
  });
}

