import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import { db, DB_PATH } from './db.js';
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
import { getTodayJalali, toJalaliString } from '../lib/dateUtils.js';
import { runAllTests } from './tests.js';

export const apiRouter = Router();

// Test runner endpoint
apiRouter.get('/tests/run', requireAuth, async (_req: Request, res: Response) => {
  try {
    const report = await runAllTests();
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const SESSION_SECRET = process.env.SESSION_SECRET || 'hesabyar_jwt_secret_key_2026_salt';

export function createSignedToken(userId: number, username: string): string {
  const payload = {
    uid: userId,
    usr: username,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
  };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

export function verifySignedToken(token: string): { id: number; username: string; full_name: string } | null {
  if (!token || typeof token !== 'string') return null;

  // 1. Stateless signed token verification (crucial for multi-lambda serverless like Vercel)
  const parts = token.split('.');
  if (parts.length === 2) {
    const [b64, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(b64).digest('base64url');
    if (sig === expectedSig) {
      try {
        const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
        if (payload.exp && Date.now() < payload.exp) {
          const user = db.prepare('SELECT id, username, full_name FROM users WHERE id = ?').get(payload.uid) as any;
          if (user) {
            return user;
          }
        }
      } catch {}
    }
  }

  // 2. Database session table lookup (for legacy/test sessions)
  try {
    const session = db.prepare(`
      SELECT s.token, s.user_id, u.username, u.full_name, s.expires_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND datetime(s.expires_at) > datetime('now')
    `).get(token) as any;
    if (session) {
      return { id: session.user_id, username: session.username, full_name: session.full_name };
    }
  } catch {}

  return null;
}

// Middleware: Authenticate session token
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.auth_token || req.headers['authorization']?.replace('Bearer ', '') || (req.query?.token as string);
  if (!token) {
    return res.status(401).json({ error: 'لطفاً ابتدا وارد حساب کاربری خود شوید.' });
  }

  const user = verifySignedToken(token);
  if (!user) {
    return res.status(401).json({ error: 'نشست کاربری شما منقضی شده است. لطفاً مجدداً وارد شوید.' });
  }

  (req as any).user = user;
  next();
}

// ======================== AUTHENTICATION ========================

apiRouter.post('/auth/login', (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'نام کاربری و کلمه عبور الزامی است.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'نام کاربری یا کلمه عبور اشتباه است.' });
    }

    const token = createSignedToken(user.id, user.username);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

    try {
      db.prepare(`
        INSERT INTO sessions (token, user_id, expires_at)
        VALUES (?, ?, ?)
      `).run(token, user.id, expiresAt);
    } catch {}

    // Cross-site and standalone safe cookie
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      token,
      user: { id: user.id, username: user.username, fullName: user.full_name }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/auth/logout', (req: Request, res: Response) => {
  const token = req.cookies?.auth_token || req.headers['authorization']?.replace('Bearer ', '');
  if (token) {
    try {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    } catch {}
  }
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/'
  });
  res.json({ success: true });
});

apiRouter.get('/auth/me', (req: Request, res: Response) => {
  const token = req.cookies?.auth_token || req.headers['authorization']?.replace('Bearer ', '') || (req.query?.token as string);
  const noAuto = req.query.noAuto === 'true';

  if (token) {
    const user = verifySignedToken(token);
    if (user) {
      return res.json({
        authenticated: true,
        token,
        user: { id: user.id, username: user.username, fullName: user.full_name }
      });
    }
  }

  // If manual logout was requested, do not auto-login
  if (noAuto) {
    return res.json({ authenticated: false });
  }

  // Seamless auto-provisioning for single store owner in preview/dev
  const adminUser = db.prepare("SELECT id, username, full_name FROM users WHERE username = 'admin' OR id = 1 LIMIT 1").get() as any;
  if (adminUser) {
    const newToken = createSignedToken(adminUser.id, adminUser.username);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    try {
      db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(newToken, adminUser.id, expiresAt);
    } catch {}

    res.cookie('auth_token', newToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    return res.json({
      authenticated: true,
      token: newToken,
      user: { id: adminUser.id, username: adminUser.username, fullName: adminUser.full_name }
    });
  }

  res.json({ authenticated: false });
});

apiRouter.post('/auth/change-password', requireAuth, (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = (req as any).user.id || (req as any).user.user_id;

    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as any;
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(400).json({ error: 'رمز عبور فعلی نادرست است.' });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const newHash = bcrypt.hashSync(newPassword, salt);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, userId);

    res.json({ success: true, message: 'رمز عبور با موفقیت به‌روزرسانی شد.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ======================== SETTINGS ========================

apiRouter.get('/settings', requireAuth, (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT key, value FROM app_settings').all() as any[];
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json(settings);
});

apiRouter.post('/settings', requireAuth, (req: Request, res: Response) => {
  try {
    const upsert = db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    const updateBatch = db.transaction((entries: Record<string, string>) => {
      for (const [k, v] of Object.entries(entries)) {
        upsert.run(k, String(v));
      }
    });
    updateBatch(req.body);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ======================== CUSTOMERS ========================

apiRouter.get('/customers', requireAuth, (req: Request, res: Response) => {
  try {
    const search = req.query.search as string;
    let query = 'SELECT * FROM customers WHERE is_active = 1';
    const params: any[] = [];

    if (search) {
      query += ' AND (name LIKE ? OR phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    query += ' ORDER BY id ASC';

    const list = db.prepare(query).all(...params) as any[];
    const customersWithBalances = list.map(c => {
      const summary = getCustomerFinancialSummary(c.id);
      return {
        ...c,
        balance: summary.netBalance,
        totalInvoiced: summary.totalInvoiced,
        totalPaid: summary.totalPaid,
        openInvoicesCount: summary.openInvoicesCount,
        lastPaymentDate: summary.lastPaymentDate
      };
    });

    res.json(customersWithBalances);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/customers', requireAuth, (req: Request, res: Response) => {
  try {
    const { name, phone, address, notes } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'نام و نام خانوادگی مشتری الزامی است.' });
    }

    const insert = db.prepare(`
      INSERT INTO customers (name, phone, address, notes, is_active)
      VALUES (?, ?, ?, ?, 1)
    `);
    const result = insert.run(
      name.trim(),
      phone ? phone.trim() : null,
      address ? address.trim() : null,
      notes ? notes.trim() : null
    );

    res.json({ id: Number(result.lastInsertRowid), success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/customers/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const { name, phone, address, notes } = req.body;
    const id = parseInt(req.params.id, 10);
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'نام و نام خانوادگی مشتری الزامی است.' });
    }

    const existing = db.prepare('SELECT phone, address, notes FROM customers WHERE id = ?').get(id) as any;
    const finalPhone = phone !== undefined ? (phone ? phone.trim() : null) : (existing?.phone || null);
    const finalAddress = address !== undefined ? (address ? address.trim() : null) : (existing?.address || null);
    const finalNotes = notes !== undefined ? (notes ? notes.trim() : null) : (existing?.notes || null);

    db.prepare(`
      UPDATE customers
      SET name = ?, phone = ?, address = ?, notes = ?
      WHERE id = ?
    `).run(name.trim(), finalPhone, finalAddress, finalNotes, id);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/customers/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (id === 1) {
      return res.status(400).json({ error: 'حذف مشتری پیش‌فرض متفرقه امکان‌پذیر نیست.' });
    }

    // Check financial history
    const summary = getCustomerFinancialSummary(id);
    if (summary.totalInvoiced > 0 || summary.totalPaid > 0 || summary.netBalance !== 0) {
      // Soft-delete (deactivate) to protect financial integrity
      db.prepare('UPDATE customers SET is_active = 0 WHERE id = ?').run(id);
      return res.json({ success: true, message: 'مشتری دارای سابقه مالی است، لذا به جای حذف دائمی غیرفعال گردید.' });
    }

    db.prepare('DELETE FROM customers WHERE id = ?').run(id);
    res.json({ success: true, message: 'مشتری حذف گردید.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/customers/:id/statement', requireAuth, (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id, 10);
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId) as any;
    if (!customer) {
      return res.status(404).json({ error: 'مشتری یافت نشد.' });
    }

    const summary = getCustomerFinancialSummary(customerId);
    const invoices = db.prepare(`
      SELECT * FROM invoices 
      WHERE customer_id = ? AND status != 'cancelled'
      ORDER BY id DESC
    `).all(customerId) as any[];

    const payments = db.prepare(`
      SELECT * FROM payments 
      WHERE customer_id = ? AND status = 'valid'
      ORDER BY id DESC
    `).all(customerId) as any[];

    res.json({
      customer,
      summary,
      invoices,
      payments
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ======================== PRODUCTS ========================

apiRouter.get('/products', requireAuth, (req: Request, res: Response) => {
  try {
    const category = req.query.category as string;
    const search = req.query.search as string;
    let query = 'SELECT * FROM products WHERE is_active = 1';
    const params: any[] = [];

    if (category && category !== 'all') {
      query += ' AND category = ?';
      params.push(category);
    }
    if (search) {
      query += ' AND (name LIKE ? OR category LIKE ? OR code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY id DESC';
    const list = db.prepare(query).all(...params);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/products', requireAuth, (req: Request, res: Response) => {
  try {
    const { name, category, quantity, code, unit, default_sale_price, purchase_price, notes } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'نام کالا الزامی است.' });
    }

    const insert = db.prepare(`
      INSERT INTO products (name, category, quantity, code, unit, default_sale_price, purchase_price, notes, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    const result = insert.run(
      name.trim(),
      category?.trim() || 'مواد غذایی',
      Math.max(0, parseFloat(quantity) || 0),
      code?.trim() || null,
      unit?.trim() || 'عدد',
      Math.round(Number(default_sale_price) || 0),
      Math.round(Number(purchase_price) || 0),
      notes?.trim() || null
    );

    const created = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, product: created, id: Number(result.lastInsertRowid) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/products/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, category, quantity, code, unit, default_sale_price, purchase_price, notes } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'نام کالا الزامی است.' });
    }

    db.prepare(`
      UPDATE products
      SET name = ?, category = ?, quantity = ?, code = ?, unit = ?, default_sale_price = ?, purchase_price = ?, notes = ?
      WHERE id = ?
    `).run(
      name.trim(),
      category?.trim() || 'مواد غذایی',
      Math.max(0, parseFloat(quantity) || 0),
      code?.trim() || null,
      unit?.trim() || 'عدد',
      Math.round(Number(default_sale_price) || 0),
      Math.round(Number(purchase_price) || 0),
      notes?.trim() || null,
      id
    );

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.patch('/products/:id/quantity', requireAuth, (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { quantity, delta } = req.body;
    if (typeof delta === 'number') {
      db.prepare('UPDATE products SET quantity = MAX(0, quantity + ?) WHERE id = ?').run(delta, id);
    } else if (typeof quantity === 'number') {
      db.prepare('UPDATE products SET quantity = MAX(0, ?) WHERE id = ?').run(quantity, id);
    }
    const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    res.json({ success: true, product: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/products/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    // Soft delete to protect past invoice items
    db.prepare('UPDATE products SET is_active = 0 WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ======================== INVOICES ========================

// Generate unique invoice number
function generateInvoiceNumber(): string {
  const today = getTodayJalali().replace(/\//g, '');
  const countRow = db.prepare(`SELECT COUNT(*) as count FROM invoices WHERE invoice_number LIKE ?`).get(`فاک-${today}-%`) as { count: number };
  const seq = String(countRow.count + 1).padStart(4, '0');
  return `فاک-${today}-${seq}`;
}

apiRouter.get('/invoices', requireAuth, (req: Request, res: Response) => {
  try {
    const { status, customerId, search, startDate, endDate } = req.query;
    let query = `
      SELECT i.*, c.name as customer_name, c.phone as customer_phone
      FROM invoices i
      LEFT JOIN customers c ON c.id = i.customer_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status && status !== 'all') {
      query += ' AND i.status = ?';
      params.push(status);
    }
    if (customerId) {
      query += ' AND i.customer_id = ?';
      params.push(customerId);
    }
    if (startDate) {
      query += ' AND i.issue_date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND i.issue_date <= ?';
      params.push(endDate);
    }
    if (search) {
      query += ' AND (i.invoice_number LIKE ? OR i.customer_name_snapshot LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY i.id DESC';
    const invoices = db.prepare(query).all(...params);
    res.json(invoices);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/invoices/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const invoice = db.prepare(`
      SELECT i.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address
      FROM invoices i
      LEFT JOIN customers c ON c.id = i.customer_id
      WHERE i.id = ?
    `).get(id) as any;

    if (!invoice) {
      return res.status(404).json({ error: 'فاکتور یافت نشد.' });
    }

    const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC').all(id);
    const allocations = db.prepare(`
      SELECT pa.amount, pa.created_at, p.id as payment_id, p.payment_date, p.payment_method, p.tracking_code
      FROM payment_allocations pa
      JOIN payments p ON p.id = pa.payment_id
      WHERE pa.invoice_id = ? AND p.status = 'valid'
      ORDER BY pa.id ASC
    `).all(id);

    res.json({
      invoice,
      items,
      allocations
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/invoices', requireAuth, (req: Request, res: Response) => {
  try {
    const {
      customerId,
      customerName,
      issueDate,
      dueDate,
      items,
      discountType = 'amount',
      discountValue = 0,
      additionalCharges = 0,
      initialPaymentAmount = 0,
      paymentMethod = 'cash',
      paymentTrackingCode = '',
      notes = '',
      isDraft = false
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'حداقل یک قلم کالا در فاکتور باید ثبت شود.' });
    }

    let targetCustomerId = Number(customerId);
    let resolvedCustomerName = customerName;

    // Handle walk-in customer or existing customer
    if (!targetCustomerId) {
      targetCustomerId = 1; // Default walk-in
      resolvedCustomerName = customerName || 'مشتری متفرقه';
    } else {
      const c = db.prepare('SELECT id, name FROM customers WHERE id = ?').get(targetCustomerId) as any;
      if (c) {
        resolvedCustomerName = c.name;
      }
    }

    const createTransaction = db.transaction(() => {
      // 1. Calculate items subtotal
      let subtotal = 0;
      const calculatedItems = items.map((it: any) => {
        const qty = parseFloat(it.quantity) || 1;
        const price = Math.round(parseFloat(it.unitPrice) || 0);
        const itemDiscount = Math.round(parseFloat(it.discountAmount) || 0);
        const rowTotal = Math.max(0, Math.round(qty * price - itemDiscount));
        subtotal += rowTotal;

        return {
          productId: it.productId || null,
          productName: it.productName || 'کالا',
          unit: it.unit || 'عدد',
          quantity: qty,
          unitPrice: price,
          purchasePriceSnapshot: Math.round(parseFloat(it.purchasePrice) || 0),
          discountAmount: itemDiscount,
          totalAmount: rowTotal
        };
      });

      // 2. Calculate final total
      let calcDiscountAmount = 0;
      if (discountType === 'percent') {
        calcDiscountAmount = Math.round((subtotal * Math.min(100, Math.max(0, parseFloat(discountValue) || 0))) / 100);
      } else {
        calcDiscountAmount = Math.round(Math.min(subtotal, Math.max(0, parseFloat(discountValue) || 0)));
      }

      const addCharges = Math.round(Math.max(0, parseFloat(additionalCharges) || 0));
      const finalTotal = Math.max(0, subtotal - calcDiscountAmount + addCharges);

      const invoiceNum = generateInvoiceNumber();
      const resolvedIssueDate = issueDate || getTodayJalali();
      const initialStatus = isDraft ? 'draft' : 'unpaid';

      // 3. Insert Invoice
      const insertInv = db.prepare(`
        INSERT INTO invoices (
          invoice_number, customer_id, customer_name_snapshot, issue_date, due_date,
          subtotal, discount_type, discount_value, discount_amount, additional_charges,
          final_total, paid_amount, remaining_amount, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      `);

      const result = insertInv.run(
        invoiceNum,
        targetCustomerId,
        resolvedCustomerName,
        resolvedIssueDate,
        dueDate || null,
        subtotal,
        discountType,
        Math.round(parseFloat(discountValue) || 0),
        calcDiscountAmount,
        addCharges,
        finalTotal,
        finalTotal, // initial remaining is finalTotal
        initialStatus,
        notes || ''
      );

      const invoiceId = Number(result.lastInsertRowid);

      // 4. Insert Items
      const insertItem = db.prepare(`
        INSERT INTO invoice_items (
          invoice_id, product_id, product_name, unit, quantity, unit_price,
          purchase_price_snapshot, discount_amount, total_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of calculatedItems) {
        insertItem.run(
          invoiceId,
          item.productId,
          item.productName,
          item.unit,
          item.quantity,
          item.unitPrice,
          item.purchasePriceSnapshot,
          item.discountAmount,
          item.totalAmount
        );
      }

      // 5. If initial payment provided and not draft, record it immediately
      const initialPay = Math.round(parseFloat(initialPaymentAmount) || 0);
      if (initialPay > 0 && !isDraft) {
        recordPayment({
          customerId: targetCustomerId,
          amount: initialPay,
          paymentDate: resolvedIssueDate,
          paymentMethod: paymentMethod || 'cash',
          trackingCode: paymentTrackingCode,
          notes: `پیش‌پرداخت / پرداخت اولیه فاکتور شماره ${invoiceNum}`,
          allocations: [{ invoiceId, amount: Math.min(initialPay, finalTotal) }]
        });
      }

      // 6. Recalculate status
      recalculateInvoice(invoiceId);

      return { invoiceId, invoiceNumber: invoiceNum };
    });

    const out = createTransaction();
    res.json({ success: true, ...out });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/invoices/:id/cancel', requireAuth, (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { reason } = req.body;

    const cancelTransaction = db.transaction(() => {
      const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as any;
      if (!inv) throw new Error('فاکتور یافت نشد.');

      // Check if there are allocations
      const allocations = db.prepare('SELECT * FROM payment_allocations WHERE invoice_id = ?').all(id) as any[];
      if (allocations.length > 0) {
        // Return allocated payments to customer credit
        for (const alloc of allocations) {
          db.prepare(`
            INSERT INTO customer_credits (customer_id, payment_id, amount, used_amount, remaining_credit)
            VALUES (?, ?, ?, 0, ?)
          `).run(inv.customer_id, alloc.payment_id, alloc.amount, alloc.amount);
        }
        db.prepare('DELETE FROM payment_allocations WHERE invoice_id = ?').run(id);
      }

      db.prepare(`
        UPDATE invoices
        SET status = 'cancelled', paid_amount = 0, remaining_amount = 0, notes = notes || ' [ابطال: ' || ? || ']'
        WHERE id = ?
      `).run(reason || 'ابطال توسط کاربر', id);

      db.prepare(`
        INSERT INTO audit_logs (action, entity_type, entity_id, details)
        VALUES ('cancel_invoice', 'invoice', ?, ?)
      `).run(id, JSON.stringify({ reason }));
    });

    cancelTransaction();
    res.json({ success: true, message: 'فاکتور با موفقیت ابطال شد.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ======================== PAYMENTS ========================

apiRouter.get('/payments', requireAuth, (req: Request, res: Response) => {
  try {
    const { customerId, status } = req.query;
    let query = `
      SELECT p.*, c.name as customer_name, c.phone as customer_phone
      FROM payments p
      JOIN customers c ON c.id = p.customer_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (customerId) {
      query += ' AND p.customer_id = ?';
      params.push(customerId);
    }
    if (status) {
      query += ' AND p.status = ?';
      params.push(status);
    }
    query += ' ORDER BY p.id DESC';

    const payments = db.prepare(query).all(...params) as any[];
    // Attach allocations
    const withAllocations = payments.map(p => {
      const allocs = db.prepare(`
        SELECT pa.amount, i.invoice_number, i.id as invoice_id
        FROM payment_allocations pa
        JOIN invoices i ON i.id = pa.invoice_id
        WHERE pa.payment_id = ?
      `).all(p.id);
      return { ...p, allocations: allocs };
    });

    res.json(withAllocations);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/payments', requireAuth, (req: Request, res: Response) => {
  try {
    const {
      customerId,
      amount,
      paymentDate,
      paymentMethod,
      trackingCode,
      notes,
      idempotencyKey,
      allocations
    } = req.body;

    const result = recordPayment({
      customerId: Number(customerId),
      amount: Number(amount),
      paymentDate: paymentDate || getTodayJalali(),
      paymentMethod: paymentMethod || 'cash',
      trackingCode,
      notes,
      idempotencyKey,
      allocations: allocations || []
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/payments/:id/refund', requireAuth, (req: Request, res: Response) => {
  try {
    const paymentId = parseInt(req.params.id, 10);
    const { reason } = req.body;
    const result = refundOrVoidPayment(paymentId, reason || 'استرداد وجه');
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/customers/:id/apply-credit', requireAuth, (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id, 10);
    const { invoiceId, amount } = req.body;
    const result = applyCustomerCredit(customerId, Number(invoiceId), Number(amount));
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ======================== RECEIVABLES & DEBTORS ========================

apiRouter.get('/receivables', requireAuth, (_req: Request, res: Response) => {
  try {
    const customers = db.prepare('SELECT id, name, phone, address FROM customers WHERE is_active = 1').all() as any[];
    const debtors = [];
    let totalOutstandingAmount = 0;

    for (const c of customers) {
      const summary = getCustomerFinancialSummary(c.id);
      if (summary.netBalance > 0) {
        totalOutstandingAmount += summary.netBalance;
        debtors.push({
          id: c.id,
          name: c.name,
          phone: c.phone,
          address: c.address,
          totalDebt: summary.netBalance,
          openInvoicesCount: summary.openInvoicesCount,
          firstDebtDate: summary.firstDebtDate,
          lastPaymentDate: summary.lastPaymentDate
        });
      }
    }

    debtors.sort((a, b) => b.totalDebt - a.totalDebt);

    res.json({
      debtors,
      totalOutstandingAmount,
      debtorCount: debtors.length
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ======================== DASHBOARD ========================

apiRouter.get('/dashboard', requireAuth, (_req: Request, res: Response) => {
  try {
    const today = getTodayJalali();
    const currentYearMonth = today.substring(0, 7); // e.g. 1405/08

    // Today sales
    const todaySalesRow = db.prepare(`
      SELECT COALESCE(SUM(final_total), 0) as s, COUNT(*) as c
      FROM invoices
      WHERE issue_date = ? AND status != 'cancelled' AND status != 'draft'
    `).get(today) as any;

    // Month sales
    const monthSalesRow = db.prepare(`
      SELECT COALESCE(SUM(final_total), 0) as s
      FROM invoices
      WHERE issue_date LIKE ? AND status != 'cancelled' AND status != 'draft'
    `).get(`${currentYearMonth}%`) as any;

    // Today collections
    const todayReceiptsRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as r
      FROM payments
      WHERE payment_date = ? AND status = 'valid'
    `).get(today) as any;

    // Month collections
    const monthReceiptsRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as r
      FROM payments
      WHERE payment_date LIKE ? AND status = 'valid'
    `).get(`${currentYearMonth}%`) as any;

    // Total receivables & debtor count
    const allCustomers = db.prepare('SELECT id FROM customers WHERE is_active = 1').all() as any[];
    let totalReceivables = 0;
    let debtorCount = 0;
    for (const c of allCustomers) {
      const summary = getCustomerFinancialSummary(c.id);
      if (summary.netBalance > 0) {
        totalReceivables += summary.netBalance;
        debtorCount++;
      }
    }

    // Invoices count
    const invoiceCountRow = db.prepare(`
      SELECT 
        COUNT(CASE WHEN issue_date = ? THEN 1 END) as today_invoices,
        COUNT(CASE WHEN remaining_amount > 0 AND status != 'cancelled' AND status != 'draft' THEN 1 END) as unpaid_invoices
      FROM invoices
    `).get(today) as any;

    // Estimated gross profit (if cost prices were recorded)
    const profitRow = db.prepare(`
      SELECT COALESCE(SUM(ii.total_amount - (ii.quantity * ii.purchase_price_snapshot)), 0) as gross_profit
      FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id
      WHERE i.status != 'cancelled' AND i.status != 'draft' AND ii.purchase_price_snapshot > 0
    `).get() as any;

    // Daily sales trend for the past 7 days
    const salesTrend = db.prepare(`
      SELECT issue_date as date, SUM(final_total) as sales, SUM(paid_amount) as receipts
      FROM invoices
      WHERE status != 'cancelled' AND status != 'draft'
      GROUP BY issue_date
      ORDER BY issue_date DESC
      LIMIT 14
    `).all() as any[];

    // Top selling products
    const topProducts = db.prepare(`
      SELECT product_name, SUM(quantity) as total_qty, SUM(total_amount) as total_amount
      FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id
      WHERE i.status != 'cancelled' AND i.status != 'draft'
      GROUP BY product_name
      ORDER BY total_amount DESC
      LIMIT 6
    `).all();

    // Top purchasing customers
    const topCustomers = db.prepare(`
      SELECT c.name, SUM(i.final_total) as total_spent, COUNT(i.id) as invoice_count
      FROM invoices i
      JOIN customers c ON c.id = i.customer_id
      WHERE i.status != 'cancelled' AND i.status != 'draft'
      GROUP BY c.id
      ORDER BY total_spent DESC
      LIMIT 5
    `).all();

    res.json({
      todaySales: todaySalesRow.s,
      monthSales: monthSalesRow.s,
      todayReceipts: todayReceiptsRow.r,
      monthReceipts: monthReceiptsRow.r,
      totalReceivables,
      debtorCount,
      todayInvoicesCount: invoiceCountRow.today_invoices,
      unpaidInvoicesCount: invoiceCountRow.unpaid_invoices,
      estimatedGrossProfit: profitRow.gross_profit || 0,
      salesTrend: salesTrend.reverse(),
      topProducts,
      topCustomers
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ======================== EXPORT REPORTS ========================

apiRouter.get('/reports/excel', requireAuth, (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const buffer = generateComprehensiveExcelReport({
      startDate: startDate as string,
      endDate: endDate as string
    });

    const filename = `Hesabyar_Report_${getTodayJalali().replace(/\//g, '-')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/reports/pdf/:customerId', requireAuth, async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.customerId, 10);
    const customer = db.prepare('SELECT name FROM customers WHERE id = ?').get(customerId) as any;
    if (!customer) {
      return res.status(404).json({ error: 'مشتری یافت نشد.' });
    }
    const buffer = await generateCustomerPdfReport(customerId);

    // Save as customer's name as requested: "سیوش به صورت اسم مشتری باشه"
    const safeName = (customer.name || 'مشتری').trim();
    const filename = `${safeName}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', buffer.length.toString());
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type, Content-Length');
    const asciiFallback = `Customer_${customerId}.pdf`;
    res.setHeader('Content-Disposition', `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/reports/word/:customerId', requireAuth, async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.customerId, 10);
    const buffer = await generateCustomerWordReport(customerId);

    const customer = db.prepare('SELECT name FROM customers WHERE id = ?').get(customerId) as any;
    const safeName = (customer?.name || 'Customer').replace(/[^a-zA-Z0-9\u0600-\u06FF_-]/g, '_');
    const filename = `صورتحساب_${safeName}_${getTodayJalali().replace(/\//g, '-')}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ======================== BACKUP & RESTORE ========================

apiRouter.get('/backup/download', requireAuth, (_req: Request, res: Response) => {
  try {
    // Flush WAL to disk first
    db.pragma('wal_checkpoint(TRUNCATE)');
    const filename = `hesabyar_backup_${getTodayJalali().replace(/\//g, '-')}.db`;
    res.download(DB_PATH, filename);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/backup/json', requireAuth, (_req: Request, res: Response) => {
  try {
    const tables = ['customers', 'products', 'invoices', 'invoice_items', 'payments', 'payment_allocations', 'customer_credits', 'expenses', 'app_settings'];
    const dump: Record<string, any[]> = {};
    for (const t of tables) {
      dump[t] = db.prepare(`SELECT * FROM ${t}`).all();
    }
    const payload = JSON.stringify(dump, null, 2);
    const filename = `hesabyar_dump_${getTodayJalali().replace(/\//g, '-')}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(payload);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/backup/restore-json', requireAuth, (req: Request, res: Response) => {
  try {
    const dump = req.body;
    if (!dump || typeof dump !== 'object') {
      return res.status(400).json({ error: 'فرمت داده‌های بازیابی معتبر نیست.' });
    }

    const restoreTransaction = db.transaction(() => {
      // Clear current data except users table
      db.exec(`
        DELETE FROM invoice_items;
        DELETE FROM payment_allocations;
        DELETE FROM customer_credits;
        DELETE FROM payments;
        DELETE FROM invoices;
        DELETE FROM expenses;
        DELETE FROM products;
        DELETE FROM customers;
      `);

      if (Array.isArray(dump.customers)) {
        const ins = db.prepare('INSERT INTO customers (id, name, phone, address, notes, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
        for (const c of dump.customers) ins.run(c.id, c.name, c.phone, c.address, c.notes, c.is_active, c.created_at);
      }
      if (Array.isArray(dump.products)) {
        const ins = db.prepare('INSERT INTO products (id, name, code, unit, default_sale_price, purchase_price, notes, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        for (const p of dump.products) ins.run(p.id, p.name, p.code, p.unit, p.default_sale_price, p.purchase_price, p.notes, p.is_active, p.created_at);
      }
      if (Array.isArray(dump.invoices)) {
        const ins = db.prepare('INSERT INTO invoices (id, invoice_number, customer_id, customer_name_snapshot, issue_date, due_date, subtotal, discount_type, discount_value, discount_amount, additional_charges, final_total, paid_amount, remaining_amount, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        for (const i of dump.invoices) ins.run(i.id, i.invoice_number, i.customer_id, i.customer_name_snapshot, i.issue_date, i.due_date, i.subtotal, i.discount_type, i.discount_value, i.discount_amount, i.additional_charges, i.final_total, i.paid_amount, i.remaining_amount, i.status, i.notes, i.created_at, i.updated_at);
      }
      if (Array.isArray(dump.invoice_items)) {
        const ins = db.prepare('INSERT INTO invoice_items (id, invoice_id, product_id, product_name, unit, quantity, unit_price, purchase_price_snapshot, discount_amount, total_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        for (const it of dump.invoice_items) ins.run(it.id, it.invoice_id, it.product_id, it.product_name, it.unit, it.quantity, it.unit_price, it.purchase_price_snapshot, it.discount_amount, it.total_amount);
      }
      if (Array.isArray(dump.payments)) {
        const ins = db.prepare('INSERT INTO payments (id, customer_id, amount, payment_date, payment_method, tracking_code, notes, idempotency_key, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        for (const p of dump.payments) ins.run(p.id, p.customer_id, p.amount, p.payment_date, p.payment_method, p.tracking_code, p.notes, p.idempotency_key, p.status, p.created_at);
      }
      if (Array.isArray(dump.payment_allocations)) {
        const ins = db.prepare('INSERT INTO payment_allocations (id, payment_id, invoice_id, amount, created_at) VALUES (?, ?, ?, ?, ?)');
        for (const pa of dump.payment_allocations) ins.run(pa.id, pa.payment_id, pa.invoice_id, pa.amount, pa.created_at);
      }
      if (Array.isArray(dump.customer_credits)) {
        const ins = db.prepare('INSERT INTO customer_credits (id, customer_id, payment_id, amount, used_amount, remaining_credit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
        for (const cc of dump.customer_credits) ins.run(cc.id, cc.customer_id, cc.payment_id, cc.amount, cc.used_amount, cc.remaining_credit, cc.created_at);
      }
      if (Array.isArray(dump.expenses)) {
        const ins = db.prepare('INSERT INTO expenses (id, title, category, amount, expense_date, payment_method, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        for (const e of dump.expenses) ins.run(e.id, e.title, e.category, e.amount, e.expense_date, e.payment_method, e.notes, e.created_at);
      }
    });

    restoreTransaction();
    res.json({ success: true, message: 'بازیابی اطلاعات با موفقیت انجام شد.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
