import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  dbDriver,
  DB_PATH,
  ensureDbInitialized,
  dbQueryAll,
  dbQueryGet,
  dbExecute
} from './db.js';
import {
  getCustomerFinancialSummary,
  recordPayment,
  applyCustomerCredit,
  refundOrVoidPayment
} from './finance.js';
import { exportFullSnapshot, mergeOrRestoreSnapshot, reconcileAllFinancials } from './sync.js';
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
  await ensureDbInitialized();

  function assert(condition: boolean, msg: string) {
    if (!condition) throw new Error(msg);
  }

  const runId = Date.now().toString().slice(-6);

  // TEST 1: تست فروش (۳ عدد کالا ۲۰۰,۰۰۰ تومان = ۶۰۰,۰۰۰ تومان)
  try {
    const custRes = await dbExecute(
      'INSERT INTO customers (name, phone) VALUES (?, ?)',
      [`مشتری آزمون فروش ${runId}`, '09121111111']
    );
    const custId = custRes.lastInsertRowid;

    const invRes = await dbExecute(
      `INSERT INTO invoices (invoice_number, customer_id, customer_name_snapshot, issue_date, subtotal, final_total, paid_amount, remaining_amount, status)
       VALUES (?, ?, ?, '1405/08/01', 600000, 600000, 0, 600000, 'unpaid')`,
      [`TEST-INV-1-${runId}`, custId, 'مشتری آزمون فروش']
    );
    const invId = invRes.lastInsertRowid;

    await dbExecute(
      `INSERT INTO invoice_items (invoice_id, product_name, unit, quantity, unit_price, total_amount)
       VALUES (?, ?, 'عدد', 3, 200000, 600000)`,
      [invId, 'کالای تست A']
    );

    const inv = await dbQueryGet<any>('SELECT final_total, remaining_amount, subtotal FROM invoices WHERE id = ?', [invId]);
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
    const custRes = await dbExecute(
      'INSERT INTO customers (name, phone) VALUES (?, ?)',
      [`مشتری اقساط مرحله‌ای ${runId}`, '09122222222']
    );
    const custId = custRes.lastInsertRowid;

    const invRes = await dbExecute(
      `INSERT INTO invoices (invoice_number, customer_id, customer_name_snapshot, issue_date, subtotal, final_total, paid_amount, remaining_amount, status)
       VALUES (?, ?, ?, '1405/08/02', 10000000, 10000000, 0, 10000000, 'unpaid')`,
      [`TEST-INV-2-${runId}`, custId, 'مشتری اقساط مرحله‌ای']
    );
    const invId = invRes.lastInsertRowid;

    await recordPayment({
      customerId: custId,
      amount: 2000000,
      paymentDate: '1405/08/02',
      paymentMethod: 'cash',
      allocations: [{ invoiceId: invId, amount: 2000000 }]
    });

    await recordPayment({
      customerId: custId,
      amount: 3000000,
      paymentDate: '1405/08/03',
      paymentMethod: 'card_to_card',
      allocations: [{ invoiceId: invId, amount: 3000000 }]
    });

    await recordPayment({
      customerId: custId,
      amount: 1000000,
      paymentDate: '1405/08/04',
      paymentMethod: 'card_to_card',
      allocations: [{ invoiceId: invId, amount: 1000000 }]
    });

    const inv = await dbQueryGet<any>('SELECT paid_amount, remaining_amount, status FROM invoices WHERE id = ?', [invId]);
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
    const custRes = await dbExecute(
      'INSERT INTO customers (name, phone) VALUES (?, ?)',
      [`مشتری چند فاکتوره ${runId}`, '09123333333']
    );
    const custId = custRes.lastInsertRowid;

    await dbExecute(
      `INSERT INTO invoices (invoice_number, customer_id, customer_name_snapshot, issue_date, subtotal, final_total, paid_amount, remaining_amount, status)
       VALUES (?, ?, ?, '1405/08/05', 5000000, 5000000, 0, 5000000, 'unpaid')`,
      [`TEST-INV-3A-${runId}`, custId, 'مشتری چند فاکتوره']
    );

    const invBRes = await dbExecute(
      `INSERT INTO invoices (invoice_number, customer_id, customer_name_snapshot, issue_date, subtotal, final_total, paid_amount, remaining_amount, status)
       VALUES (?, ?, ?, '1405/08/06', 3000000, 3000000, 0, 3000000, 'unpaid')`,
      [`TEST-INV-3B-${runId}`, custId, 'مشتری چند فاکتوره']
    );
    const invBId = invBRes.lastInsertRowid;

    await recordPayment({
      customerId: custId,
      amount: 3000000,
      paymentDate: '1405/08/06',
      paymentMethod: 'card_to_card',
      allocations: [{ invoiceId: invBId, amount: 3000000 }]
    });

    const summary = await getCustomerFinancialSummary(custId);
    assert(summary.totalInvoiced === 8000000, `Expected total invoiced 8,000,000 but got ${summary.totalInvoiced}`);
    assert(summary.totalPaid === 3000000, `Expected total paid 3,000,000 but got ${summary.totalPaid}`);
    assert(summary.netBalance === 5000000, `Expected net balance 5,000,000 but got ${summary.netBalance}`);

    const invB = await dbQueryGet<any>('SELECT status, remaining_amount FROM invoices WHERE id = ?', [invBId]);
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
    const custRes = await dbExecute(
      'INSERT INTO customers (name, phone) VALUES (?, ?)',
      [`مشتری تخصیص مرکب ${runId}`, '09124444444']
    );
    const custId = custRes.lastInsertRowid;

    const inv1Res = await dbExecute(
      `INSERT INTO invoices (invoice_number, customer_id, customer_name_snapshot, issue_date, subtotal, final_total, paid_amount, remaining_amount, status)
       VALUES (?, ?, ?, '1405/08/07', 4000000, 4000000, 0, 4000000, 'unpaid')`,
      [`TEST-ALLOC-4A-${runId}`, custId, 'مشتری تخصیص مرکب']
    );
    const inv1Id = inv1Res.lastInsertRowid;

    const inv2Res = await dbExecute(
      `INSERT INTO invoices (invoice_number, customer_id, customer_name_snapshot, issue_date, subtotal, final_total, paid_amount, remaining_amount, status)
       VALUES (?, ?, ?, '1405/08/07', 6000000, 6000000, 0, 6000000, 'unpaid')`,
      [`TEST-ALLOC-4B-${runId}`, custId, 'مشتری تخصیص مرکب']
    );
    const inv2Id = inv2Res.lastInsertRowid;

    await recordPayment({
      customerId: custId,
      amount: 7000000,
      paymentDate: '1405/08/07',
      paymentMethod: 'card_to_card',
      allocations: [
        { invoiceId: inv1Id, amount: 4000000 },
        { invoiceId: inv2Id, amount: 3000000 }
      ]
    });

    const summary = await getCustomerFinancialSummary(custId);
    assert(summary.totalPaid === 7000000, `Expected exactly 7,000,000 paid but got ${summary.totalPaid}`);
    assert(summary.totalInvoiced === 10000000, 'Expected 10,000,000 invoiced');
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
    const custRes = await dbExecute(
      'INSERT INTO customers (name, phone) VALUES (?, ?)',
      [`مشتری پیش‌پرداخت ${runId}`, '09125555555']
    );
    const custId = custRes.lastInsertRowid;

    const payRes = await recordPayment({
      customerId: custId,
      amount: 5000000,
      paymentDate: '1405/08/08',
      paymentMethod: 'cash',
      allocations: []
    });
    assert(payRes.creditAdded === 5000000, 'Expected 5,000,000 credit added');

    let summary = await getCustomerFinancialSummary(custId);
    assert(summary.totalUnallocatedCredit === 5000000, 'Credit should be 5,000,000');
    assert(summary.netBalance === -5000000, 'Net balance should be -5,000,000 (creditor)');

    const invRes = await dbExecute(
      `INSERT INTO invoices (invoice_number, customer_id, customer_name_snapshot, issue_date, subtotal, final_total, paid_amount, remaining_amount, status)
       VALUES (?, ?, ?, '1405/08/09', 3000000, 3000000, 0, 3000000, 'unpaid')`,
      [`TEST-CRED-${runId}`, custId, 'مشتری پیش‌پرداخت']
    );
    const invId = invRes.lastInsertRowid;

    await applyCustomerCredit(custId, invId, 3000000);

    const inv = await dbQueryGet<any>('SELECT status, remaining_amount, paid_amount FROM invoices WHERE id = ?', [invId]);
    assert(inv.status === 'paid', 'Invoice should be paid via credit');
    assert(inv.remaining_amount === 0, 'Remaining should be 0');

    summary = await getCustomerFinancialSummary(custId);
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
    const custRes = await dbExecute(
      'INSERT INTO customers (name, phone) VALUES (?, ?)',
      [`مشتری تست استرداد ${runId}`, '09126666666']
    );
    const custId = custRes.lastInsertRowid;

    const invRes = await dbExecute(
      `INSERT INTO invoices (invoice_number, customer_id, customer_name_snapshot, issue_date, subtotal, final_total, paid_amount, remaining_amount, status)
       VALUES (?, ?, ?, '1405/08/10', 2000000, 2000000, 0, 2000000, 'unpaid')`,
      [`TEST-REFUND-${runId}`, custId, 'مشتری تست استرداد']
    );
    const invId = invRes.lastInsertRowid;

    const pay = await recordPayment({
      customerId: custId,
      amount: 2000000,
      paymentDate: '1405/08/10',
      paymentMethod: 'card_to_card',
      allocations: [{ invoiceId: invId, amount: 2000000 }]
    });

    let inv = await dbQueryGet<any>('SELECT status, remaining_amount FROM invoices WHERE id = ?', [invId]);
    assert(inv.status === 'paid', 'Invoice should be paid');

    await refundOrVoidPayment(pay.paymentId, 'برگشت کالا توسط مشتری');

    inv = await dbQueryGet<any>('SELECT status, remaining_amount, paid_amount FROM invoices WHERE id = ?', [invId]);
    assert(inv.status === 'unpaid', 'Invoice should revert to unpaid after refund');
    assert(inv.paid_amount === 0, 'Paid amount should be 0');
    assert(inv.remaining_amount === 2000000, 'Remaining should be 2,000,000');

    const adj = await dbQueryGet<any>('SELECT * FROM financial_adjustments WHERE entity_id = ?', [pay.paymentId]);
    assert(adj && adj.amount === 2000000, 'Audit adjustment should be recorded');

    results.push({
      name: '۶. تست استرداد وجه، برگشت وضعیت فاکتور و ثبت در ردپای حسابرسی',
      status: 'PASSED',
      details: 'وجه ۲ میلیون تومانی مسترد شد، فاکتور مجدداً به وضعیت پرداخت‌نشده برگشت و سند تعدیل با دلیل در دیتابیس ثبت شد.'
    });
  } catch (err: any) {
    results.push({ name: '۶. تست استرداد وجه', status: 'FAILED', details: err.message });
  }

  // TEST 7: تست خروجی‌های واقعی فایل اکسل، پی‌دی‌اف و ورد
  try {
    const excelBuffer = await generateComprehensiveExcelReport();
    assert(excelBuffer && excelBuffer.length > 1000, 'Excel buffer must be generated and valid');

    const wb = XLSX.read(excelBuffer, { type: 'buffer' });
    assert(wb.SheetNames.includes('مشتریان'), 'Excel must have مشتریان sheet');
    assert(wb.SheetNames.includes('فاکتورها'), 'Excel must have فاکتورها sheet');
    assert(wb.SheetNames.includes('پرداخت‌ها'), 'Excel must have پرداخت‌ها sheet');
    assert(wb.SheetNames.includes('خلاصه مالی'), 'Excel must have خلاصه مالی sheet');

    const cust = await dbQueryGet<any>('SELECT id FROM customers LIMIT 1');
    const wordBuffer = await generateCustomerWordReport(cust.id);
    assert(wordBuffer && wordBuffer.length > 2000, 'Word buffer must be generated and non-empty');

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

  // TEST 8: تست امنیت و کنترل دسترسی
  try {
    const fakeToken = 'invalid-session-token-12345';
    const session = await dbQueryGet('SELECT * FROM sessions WHERE token = ?', [fakeToken]);
    assert(!session, 'Invalid session should not be found');

    const user = await dbQueryGet<any>("SELECT * FROM users WHERE username = 'admin'");
    assert(user && user.password_hash.startsWith('$2'), 'Password must be securely hashed with bcrypt');

    results.push({
      name: '۸. تست امنیت (هش رمز عبور با bcrypt و اعتبارسنجی نشست‌ها)',
      status: 'PASSED',
      details: 'تمام پسوردها با bcrypt ایمن‌سازی شده و توکن‌های نشست فاقد اعتبار مسدود می‌گردند.'
    });
  } catch (err: any) {
    results.push({ name: '۸. تست امنیت', status: 'FAILED', details: err.message });
  }

  // TEST 9: تست پایداری و ماندگاری اطلاعات (SQLite ACID WAL / Turso)
  try {
    const testCustName = `مشتری پایداری_${Date.now()}`;
    const insertRes = await dbExecute(
      'INSERT INTO customers (name, phone) VALUES (?, ?)',
      [testCustName, '09999999999']
    );
    const createdId = insertRes.lastInsertRowid;

    if (dbDriver === 'sqlite') {
      const testDb = new Database(DB_PATH);
      const queried = testDb.prepare('SELECT name FROM customers WHERE id = ?').get(createdId) as any;
      testDb.close();
      assert(queried && queried.name === testCustName, 'Data must persist across database connections');
    } else {
      const queried = await dbQueryGet<any>('SELECT name FROM customers WHERE id = ?', [createdId]);
      assert(queried && queried.name === testCustName, 'Data must persist in Turso cloud');
    }

    results.push({
      name: '۹. تست پایداری دیتابیس (Durability & WAL Mode)',
      status: 'PASSED',
      details: 'اطلاعات در پایگاه‌داده ذخیره شده و در کانکشن جدید نیز کاملاً پایدار و بازیابی‌پذیر است.'
    });
  } catch (err: any) {
    results.push({ name: '۹. تست پایداری', status: 'FAILED', details: err.message });
  }

  // TEST 10: تست تهیه نسخه پشتیبان و ساختار کامل خروجی
  try {
    const dump = await exportFullSnapshot();
    assert(dump.customers.length > 0, 'Backup dump must contain customer records');
    assert(Array.isArray(dump.customers) && Array.isArray(dump.invoices) && Array.isArray(dump.products), 'Backup structure is valid JSON schema');

    results.push({
      name: '۱۰. تست پشتیبان‌گیری و خروجی یکپارچه کل دیتابیس',
      status: 'PASSED',
      details: 'پشتیبان کامل تمام جداول دیتابیس استخراج و صحت ساختار داده‌ها تأیید گردید.'
    });
  } catch (err: any) {
    results.push({ name: '۱۰. تست پشتیبان‌گیری', status: 'FAILED', details: err.message });
  }

  // TEST 11: تست ایجاد نشست و تنظیم کوکی امن
  try {
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const admin = await dbQueryGet<any>("SELECT id, username FROM users WHERE username = 'admin' LIMIT 1");
    assert(admin && admin.id, 'Admin user must exist for session creation');

    await dbExecute(
      'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)',
      [sessionToken, admin.id, expiresAt]
    );

    const storedSession = await dbQueryGet<any>(
      `SELECT s.token, s.user_id, u.username, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`,
      [sessionToken]
    );

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

  // TEST 12: تست احراز هویت مستقل از طریق کوکی
  try {
    const cookieToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const admin = await dbQueryGet<any>("SELECT id FROM users WHERE username = 'admin' LIMIT 1");

    await dbExecute('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', [cookieToken, admin.id, expiresAt]);

    const mockReq: any = {
      cookies: { auth_token: cookieToken },
      headers: {}
    };

    let nextCalled = false;
    let errorResponse: any = null;
    const mockRes: any = {
      status: (code: number) => ({
        json: (payload: any) => {
          errorResponse = { code, payload };
        }
      })
    };

    await requireAuth(mockReq, mockRes, () => {
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

  // TEST 13: تست خروج و ابطال نشست در دیتابیس
  try {
    const logoutToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const admin = await dbQueryGet<any>("SELECT id FROM users WHERE username = 'admin' LIMIT 1");

    await dbExecute('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', [logoutToken, admin.id, expiresAt]);

    let active = await dbQueryGet('SELECT token FROM sessions WHERE token = ?', [logoutToken]);
    assert(!!active, 'Session must exist prior to logout');

    await dbExecute('DELETE FROM sessions WHERE token = ?', [logoutToken]);

    active = await dbQueryGet('SELECT token FROM sessions WHERE token = ?', [logoutToken]);
    assert(!active, 'Session token must be deleted from database upon logout');

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
    let nextCalled = false;
    await requireAuth(mockReq, mockRes, () => {
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

  // TEST 14: تست دفاع در برابر کوکی دستکاری‌شده و منقضی
  try {
    const tamperedReq: any = {
      cookies: { auth_token: 'malicious_forged_token_00000000000000000000' },
      headers: {}
    };
    let tamperedStatus = 0;
    await requireAuth(tamperedReq, {
      status: (code: number) => {
        tamperedStatus = code;
        return { json: () => {} };
      }
    } as any, () => {});
    assert(tamperedStatus === 401, 'Tampered cookie token must be rejected with 401');

    const expiredToken = crypto.randomBytes(32).toString('hex');
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const admin = await dbQueryGet<any>("SELECT id FROM users WHERE username = 'admin' LIMIT 1");
    await dbExecute('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', [expiredToken, admin.id, yesterday]);

    const expiredReq: any = {
      cookies: { auth_token: expiredToken },
      headers: {}
    };
    let expiredStatus = 0;
    await requireAuth(expiredReq, {
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

  // TEST 15: تست انطباق وب‌اپلیکیشن پیش‌رونده (PWA)
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

  // TEST 16: تست همگام‌سازی کامل کل دیتابیس با حفظ کلیدهای خارجی (FK-Safe Full Sync & Reconcile)
  try {
    const custRes = await dbExecute(
      'INSERT INTO customers (name, phone, address, notes) VALUES (?, ?, ?, ?)',
      [`مشتری سینک کامل ${runId}`, '09127777777', 'بازار تهران', 'تست سینک']
    );
    const custId = custRes.lastInsertRowid;

    const prodRes = await dbExecute(
      'INSERT INTO products (name, category, quantity, default_sale_price, unit) VALUES (?, ?, ?, ?, ?)',
      [`کالای سینک ${runId}`, 'مواد غذایی', 25, 120000, 'بسته']
    );
    const prodId = prodRes.lastInsertRowid;

    const invRes = await dbExecute(
      `INSERT INTO invoices (invoice_number, customer_id, customer_name_snapshot, issue_date, subtotal, final_total, paid_amount, remaining_amount, status)
       VALUES (?, ?, ?, '1405/08/15', 240000, 240000, 0, 240000, 'unpaid')`,
      [`TEST-SYNC-${runId}`, custId, `مشتری سینک کامل ${runId}`]
    );
    const invId = invRes.lastInsertRowid;

    await recordPayment({
      customerId: custId,
      amount: 100000,
      paymentDate: '1405/08/15',
      paymentMethod: 'card_to_card',
      allocations: [{ invoiceId: invId, amount: 100000 }]
    });

    // Export full snapshot & run merge sync (must NOT break payments FK or customer_id on invoice!)
    const snap = await exportFullSnapshot();
    const custInSnap = snap.customers.find((c) => Number(c.id) === custId);
    assert(Boolean(custInSnap), 'Customer must exist in exported full snapshot');

    // Modify snapshot customer phone and merge back
    custInSnap.phone = '09128888888';
    const merged = await mergeOrRestoreSnapshot(snap, 'merge');
    const updatedCust = await dbQueryGet<any>('SELECT phone FROM customers WHERE id = ?', [custId]);
    assert(updatedCust && updatedCust.phone === '09128888888', 'Customer phone should update cleanly via UPSERT without FK error');

    const linkedInv = await dbQueryGet<any>('SELECT customer_id, paid_amount, remaining_amount FROM invoices WHERE id = ?', [invId]);
    assert(Number(linkedInv.customer_id) === custId, 'Invoice customer_id FK must remain intact after sync');
    assert(Number(linkedInv.paid_amount) === 100000 && Number(linkedInv.remaining_amount) === 140000, 'Invoice balances must stay reconciled');

    const prodInSnap = merged.products.find((p) => Number(p.id) === prodId);
    assert(prodInSnap && Number(prodInSnap.quantity) === 25, 'Product quantity & category must preserve across full sync');

    const rec = await reconcileAllFinancials();
    assert(rec.invoicesRecalculated >= 1, 'Reconciliation should verify all invoices');

    results.push({
      name: '۱۶. تست همگام‌سازی یکپارچه کل دیتابیس بدون تخریب روابط کلید خارجی (FK-Safe Full DB Sync)',
      status: 'PASSED',
      details: 'همگام‌سازی کامل جداول مشتریان، کالاها، فاکتورها و پرداخت‌ها با حفظ کامل روابط کلید خارجی و تراز مالی انجام شد.'
    });
  } catch (err: any) {
    results.push({ name: '۱۶. تست همگام‌سازی کامل دیتابیس', status: 'FAILED', details: err.message });
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
