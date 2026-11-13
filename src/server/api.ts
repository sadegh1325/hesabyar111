import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import {
  DB_PATH,
  dbDriver,
  getRawSqliteDb,
  ensureDbInitialized,
  dbQueryAll,
  dbQueryGet,
  dbExecute,
  runTransaction,
  bumpDbRevision,
  getDbHealth,
  DbSession
} from './db.js';
import {
  recalculateInvoice,
  getCustomerFinancialSummary,
  recordPayment,
  applyCustomerCredit,
  refundOrVoidPayment
} from './finance.js';
import {
  exportFullSnapshot,
  mergeOrRestoreSnapshot,
  reconcileAllFinancials,
  syncSqliteSequences
} from './sync.js';
import { generateComprehensiveExcelReport } from './exportExcel.js';
import { generateCustomerWordReport } from './exportWord.js';
import { generateCustomerPdfReport } from './exportPdf.js';
import { getTodayJalali } from '../lib/dateUtils.js';
import { runAllTests } from './tests.js';

export const apiRouter = Router();

// Ensure DB schema & migrations are initialized before any API request
apiRouter.use(async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureDbInitialized();
    next();
  } catch (err: any) {
    console.error('Database initialization failed:', err);
    res.status(500).json({ error: `خطا در راه‌اندازی دیتابیس: ${err?.message || 'خطای نامشخص'}` });
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

export async function verifySignedToken(
  token: string
): Promise<{ id: number; username: string; full_name: string } | null> {
  if (!token || typeof token !== 'string') return null;

  // 1. Stateless signed token verification (works across multi-lambda serverless like Vercel)
  const parts = token.split('.');
  if (parts.length === 2) {
    const [b64, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(b64).digest('base64url');
    if (sig === expectedSig) {
      try {
        const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
        if (payload.exp && Date.now() < payload.exp) {
          const user = await dbQueryGet<{ id: number; username: string; full_name: string }>(
            'SELECT id, username, full_name FROM users WHERE id = ?',
            [payload.uid]
          );
          if (user) return user;
        }
      } catch {}
    }
  }

  // 2. Database session table lookup (for legacy/test sessions)
  try {
    const session = await dbQueryGet<any>(
      `SELECT s.token, s.user_id, u.username, u.full_name, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND datetime(s.expires_at) > datetime('now')`,
      [token]
    );
    if (session) {
      return { id: Number(session.user_id), username: session.username, full_name: session.full_name };
    }
  } catch {}

  return null;
}

// Middleware: Authenticate session token
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureDbInitialized();
    const token =
      req.cookies?.auth_token ||
      req.headers['authorization']?.replace('Bearer ', '') ||
      (req.query?.token as string);

    if (!token) {
      return res.status(401).json({ error: 'لطفاً ابتدا وارد حساب کاربری خود شوید.' });
    }

    const user = await verifySignedToken(token);
    if (!user) {
      return res.status(401).json({ error: 'نشست کاربری شما منقضی شده است. لطفاً مجدداً وارد شوید.' });
    }

    (req as any).user = user;
    next();
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'خطا در بررسی احراز هویت' });
  }
}

// Test runner endpoint
apiRouter.get('/tests/run', requireAuth, async (_req: Request, res: Response) => {
  try {
    const report = await runAllTests();
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ======================== AUTHENTICATION ========================

apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'نام کاربری و کلمه عبور الزامی است.' });
    }

    const user = await dbQueryGet<any>('SELECT * FROM users WHERE username = ?', [username]);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'نام کاربری یا کلمه عبور اشتباه است.' });
    }

    const token = createSignedToken(Number(user.id), user.username);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    try {
      await dbExecute(
        'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?) ON CONFLICT(token) DO UPDATE SET expires_at = excluded.expires_at',
        [token, user.id, expiresAt]
      );
    } catch {}

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
      user: { id: Number(user.id), username: user.username, fullName: user.full_name }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/auth/logout', async (req: Request, res: Response) => {
  const token = req.cookies?.auth_token || req.headers['authorization']?.replace('Bearer ', '');
  if (token) {
    try {
      await dbExecute('DELETE FROM sessions WHERE token = ?', [token]);
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

apiRouter.get('/auth/me', async (req: Request, res: Response) => {
  const token =
    req.cookies?.auth_token ||
    req.headers['authorization']?.replace('Bearer ', '') ||
    (req.query?.token as string);

  if (token) {
    const user = await verifySignedToken(token);
    if (user) {
      return res.json({
        authenticated: true,
        token,
        user: { id: user.id, username: user.username, fullName: user.full_name }
      });
    }
  }

  res.json({ authenticated: false });
});

apiRouter.post('/auth/change-password', requireAuth, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = (req as any).user.id || (req as any).user.user_id;

    const user = await dbQueryGet<any>('SELECT password_hash FROM users WHERE id = ?', [userId]);
    if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(400).json({ error: 'رمز عبور فعلی نادرست است.' });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const newHash = bcrypt.hashSync(newPassword, salt);
    await dbExecute(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newHash, userId]
    );

    res.json({ success: true, message: 'رمز عبور با موفقیت به‌روزرسانی شد.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ======================== SETTINGS ========================

apiRouter.get('/settings', requireAuth, async (_req: Request, res: Response) => {
  try {
    const rows = await dbQueryAll<any>('SELECT key, value FROM app_settings');
    const settings: Record<string, string> = {};
    for (const r of rows) settings[r.key] = r.value;
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/settings', requireAuth, async (req: Request, res: Response) => {
  try {
    const entries = req.body || {};
    await runTransaction(async (tx) => {
      for (const [k, v] of Object.entries(entries)) {
        await tx.execute(
          `INSERT INTO app_settings (key, value, updated_at)
           VALUES (?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
          [k, String(v ?? '')]
        );
      }
      await bumpDbRevision(tx);
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ======================== FULL DATABASE SYNC & HEALTH ========================

apiRouter.get('/sync/health', requireAuth, async (_req: Request, res: Response) => {
  try {
    const health = await getDbHealth();
    res.json(health);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/sync/full', requireAuth, async (_req: Request, res: Response) => {
  try {
    const snapshot = await exportFullSnapshot();
    res.json(snapshot);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/sync/full', requireAuth, async (req: Request, res: Response) => {
  try {
    const payload = req.body?.snapshot || req.body;
    const mode: 'merge' | 'replace' = req.body?.mode === 'replace' ? 'replace' : 'merge';

    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'داده‌های همگام‌سازی معتبر نیستند.' });
    }

    const merged = await mergeOrRestoreSnapshot(payload, mode);
    res.json({ success: true, snapshot: merged });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/sync/reconcile', requireAuth, async (_req: Request, res: Response) => {
  try {
    const stats = await reconcileAllFinancials();
    const snapshot = await exportFullSnapshot();
    const health = await getDbHealth();
    res.json({ success: true, stats, health, snapshot });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ======================== CUSTOMERS ========================

apiRouter.get('/customers', requireAuth, async (req: Request, res: Response) => {
  try {
    const search = req.query.search as string;
    let query = 'SELECT * FROM customers WHERE is_active = 1';
    const params: any[] = [];

    if (search) {
      query += ' AND (name LIKE ? OR phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    query += ' ORDER BY id ASC';

    const list = await dbQueryAll<any>(query, params);
    const customersWithBalances = await Promise.all(
      list.map(async (c) => {
        const summary = await getCustomerFinancialSummary(Number(c.id));
        return {
          ...c,
          balance: summary.netBalance,
          totalInvoiced: summary.totalInvoiced,
          totalPaid: summary.totalPaid,
          openInvoicesCount: summary.openInvoicesCount,
          lastPaymentDate: summary.lastPaymentDate
        };
      })
    );

    res.json(customersWithBalances);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/customers', requireAuth, async (req: Request, res: Response) => {
  try {
    const { name, phone, address, notes } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'نام و نام خانوادگی مشتری الزامی است.' });
    }

    const out = await runTransaction(async (tx) => {
      const result = await tx.execute(
        `INSERT INTO customers (name, phone, address, notes, is_active)
         VALUES (?, ?, ?, ?, 1)`,
        [
          String(name).trim(),
          phone ? String(phone).trim() : null,
          address ? String(address).trim() : null,
          notes ? String(notes).trim() : null
        ]
      );
      const created = await tx.queryGet<any>('SELECT * FROM customers WHERE id = ?', [result.lastInsertRowid]);
      await bumpDbRevision(tx);
      return { id: result.lastInsertRowid, customer: created };
    });

    res.json({ id: out.id, customer: out.customer, success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/customers/batch-sync', requireAuth, async (req: Request, res: Response) => {
  try {
    const { customers } = req.body;
    if (!Array.isArray(customers) || customers.length === 0) {
      return res.json({ success: true, count: 0 });
    }

    await runTransaction(async (tx) => {
      for (const c of customers) {
        if (c.id && c.name && Number(c.id) !== 1) {
          await tx.execute(
            `INSERT INTO customers (id, name, phone, address, notes, is_active, updated_at)
             VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               phone = excluded.phone,
               address = excluded.address,
               notes = excluded.notes,
               is_active = 1,
               updated_at = CURRENT_TIMESTAMP`,
            [
              Number(c.id),
              String(c.name).trim(),
              c.phone ? String(c.phone).trim() : null,
              c.address ? String(c.address).trim() : null,
              c.notes ? String(c.notes).trim() : null
            ]
          );
        }
      }
      await syncSqliteSequences(tx);
      await bumpDbRevision(tx);
    });

    res.json({ success: true, count: customers.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/customers/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { name, phone, address, notes } = req.body;
    const id = parseInt(req.params.id, 10);
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'نام و نام خانوادگی مشتری الزامی است.' });
    }

    await runTransaction(async (tx) => {
      const existing = await tx.queryGet<any>(
        'SELECT phone, address, notes FROM customers WHERE id = ?',
        [id]
      );
      if (!existing) {
        throw new Error('مشتری مورد نظر یافت نشد.');
      }

      const finalPhone = phone !== undefined ? (phone ? String(phone).trim() : null) : (existing.phone || null);
      const finalAddress = address !== undefined ? (address ? String(address).trim() : null) : (existing.address || null);
      const finalNotes = notes !== undefined ? (notes ? String(notes).trim() : null) : (existing.notes || null);

      await tx.execute(
        `UPDATE customers
         SET name = ?, phone = ?, address = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [String(name).trim(), finalPhone, finalAddress, finalNotes, id]
      );
      await bumpDbRevision(tx);
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/customers/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (id === 1) {
      return res.status(400).json({ error: 'حذف مشتری پیش‌فرض متفرقه امکان‌پذیر نیست.' });
    }

    const summary = await getCustomerFinancialSummary(id);
    if (summary.totalInvoiced > 0 || summary.totalPaid > 0 || summary.netBalance !== 0) {
      await runTransaction(async (tx) => {
        await tx.execute(
          'UPDATE customers SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [id]
        );
        await bumpDbRevision(tx);
      });
      return res.json({
        success: true,
        message: 'مشتری دارای سابقه مالی است، لذا به جای حذف دائمی غیرفعال گردید.'
      });
    }

    await runTransaction(async (tx) => {
      await tx.execute('DELETE FROM customers WHERE id = ?', [id]);
      await bumpDbRevision(tx);
    });
    res.json({ success: true, message: 'مشتری حذف گردید.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/customers/:id/statement', requireAuth, async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id, 10);
    const customer = await dbQueryGet<any>('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!customer) {
      return res.status(404).json({ error: 'مشتری یافت نشد.' });
    }

    const summary = await getCustomerFinancialSummary(customerId);
    const invoices = await dbQueryAll<any>(
      `SELECT * FROM invoices
       WHERE customer_id = ? AND status != 'cancelled'
       ORDER BY id DESC`,
      [customerId]
    );

    const payments = await dbQueryAll<any>(
      `SELECT * FROM payments
       WHERE customer_id = ? AND status = 'valid'
       ORDER BY id DESC`,
      [customerId]
    );

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

apiRouter.get('/products', requireAuth, async (req: Request, res: Response) => {
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
    const list = await dbQueryAll(query, params);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/products', requireAuth, async (req: Request, res: Response) => {
  try {
    const { name, category, quantity, code, unit, default_sale_price, purchase_price, notes } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'نام کالا الزامی است.' });
    }

    const out = await runTransaction(async (tx) => {
      const result = await tx.execute(
        `INSERT INTO products (name, category, quantity, code, unit, default_sale_price, purchase_price, notes, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          String(name).trim(),
          category?.trim() || 'مواد غذایی',
          Math.max(0, parseFloat(quantity) || 0),
          code?.trim() || null,
          unit?.trim() || 'عدد',
          Math.round(Number(default_sale_price) || 0),
          Math.round(Number(purchase_price) || 0),
          notes?.trim() || null
        ]
      );
      const created = await tx.queryGet('SELECT * FROM products WHERE id = ?', [result.lastInsertRowid]);
      await bumpDbRevision(tx);
      return { id: result.lastInsertRowid, product: created };
    });

    res.json({ success: true, product: out.product, id: out.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/products/batch-sync', requireAuth, async (req: Request, res: Response) => {
  try {
    const { products } = req.body;
    if (!Array.isArray(products) || products.length === 0) {
      return res.json({ success: true, count: 0 });
    }

    await runTransaction(async (tx) => {
      for (const p of products) {
        if (p.id && p.name) {
          await tx.execute(
            `INSERT INTO products (id, name, category, quantity, code, unit, default_sale_price, purchase_price, notes, is_active, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               category = excluded.category,
               quantity = excluded.quantity,
               code = excluded.code,
               unit = excluded.unit,
               default_sale_price = excluded.default_sale_price,
               purchase_price = excluded.purchase_price,
               notes = excluded.notes,
               is_active = 1,
               updated_at = CURRENT_TIMESTAMP`,
            [
              Number(p.id),
              String(p.name).trim(),
              p.category || 'مواد غذایی',
              p.quantity !== undefined ? Number(p.quantity) : 0,
              p.code || null,
              p.unit || 'عدد',
              Math.round(Number(p.default_sale_price || 0)),
              Math.round(Number(p.purchase_price || 0)),
              p.notes || null
            ]
          );
        }
      }
      await syncSqliteSequences(tx);
      await bumpDbRevision(tx);
    });

    res.json({ success: true, count: products.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/products/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, category, quantity, code, unit, default_sale_price, purchase_price, notes } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'نام کالا الزامی است.' });
    }

    await runTransaction(async (tx) => {
      await tx.execute(
        `UPDATE products
         SET name = ?, category = ?, quantity = ?, code = ?, unit = ?, default_sale_price = ?, purchase_price = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          String(name).trim(),
          category?.trim() || 'مواد غذایی',
          Math.max(0, parseFloat(quantity) || 0),
          code?.trim() || null,
          unit?.trim() || 'عدد',
          Math.round(Number(default_sale_price) || 0),
          Math.round(Number(purchase_price) || 0),
          notes?.trim() || null,
          id
        ]
      );
      await bumpDbRevision(tx);
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.patch('/products/:id/quantity', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { quantity, delta } = req.body;

    const updated = await runTransaction(async (tx) => {
      if (typeof delta === 'number') {
        await tx.execute(
          'UPDATE products SET quantity = MAX(0, quantity + ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [delta, id]
        );
      } else if (typeof quantity === 'number') {
        await tx.execute(
          'UPDATE products SET quantity = MAX(0, ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [quantity, id]
        );
      }
      await bumpDbRevision(tx);
      return tx.queryGet('SELECT * FROM products WHERE id = ?', [id]);
    });

    res.json({ success: true, product: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/products/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    await runTransaction(async (tx) => {
      await tx.execute(
        'UPDATE products SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [id]
      );
      await bumpDbRevision(tx);
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ======================== INVOICES ========================

async function generateInvoiceNumber(tx: DbSession): Promise<string> {
  const today = getTodayJalali().replace(/\//g, '');
  const countRow = await tx.queryGet<{ count: number }>(
    'SELECT COUNT(*) as count FROM invoices WHERE invoice_number LIKE ?',
    [`فاک-${today}-%`]
  );
  let seqNum = Number(countRow?.count || 0) + 1;
  while (true) {
    const candidate = `فاک-${today}-${String(seqNum).padStart(4, '0')}`;
    const clash = await tx.queryGet<{ id: number }>(
      'SELECT id FROM invoices WHERE invoice_number = ?',
      [candidate]
    );
    if (!clash) return candidate;
    seqNum++;
  }
}

apiRouter.get('/invoices', requireAuth, async (req: Request, res: Response) => {
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
    const invoices = await dbQueryAll(query, params);
    res.json(invoices);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/invoices/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const invoice = await dbQueryGet<any>(
      `SELECT i.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address
       FROM invoices i
       LEFT JOIN customers c ON c.id = i.customer_id
       WHERE i.id = ?`,
      [id]
    );

    if (!invoice) {
      return res.status(404).json({ error: 'فاکتور یافت نشد.' });
    }

    const items = await dbQueryAll('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC', [id]);
    const allocations = await dbQueryAll(
      `SELECT pa.amount, pa.created_at, p.id as payment_id, p.payment_date, p.payment_method, p.tracking_code
       FROM payment_allocations pa
       JOIN payments p ON p.id = pa.payment_id
       WHERE pa.invoice_id = ? AND p.status = 'valid'
       ORDER BY pa.id ASC`,
      [id]
    );

    res.json({
      invoice,
      items,
      allocations
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/invoices', requireAuth, async (req: Request, res: Response) => {
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
      paymentMethod = 'card_to_card',
      paymentTrackingCode = '',
      notes = '',
      isDraft = false
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'حداقل یک قلم کالا در فاکتور باید ثبت شود.' });
    }

    const out = await runTransaction(async (tx) => {
      let targetCustomerId = Number(customerId) || 1;
      let resolvedCustomerName = customerName || 'مشتری متفرقه (نقدی/گذری)';

      // Ensure walk-in customer 1 always exists
      await tx.execute(
        `INSERT INTO customers (id, name, phone, notes, is_active)
         VALUES (1, ?, ?, ?, 1) ON CONFLICT(id) DO NOTHING`,
        ['مشتری متفرقه (نقدی/گذری)', '', 'مشتری پیش‌فرض فروش‌های سریع و نقدی']
      );

      const c = await tx.queryGet<any>('SELECT id, name FROM customers WHERE id = ?', [targetCustomerId]);
      if (c) {
        resolvedCustomerName = c.name;
      } else if (customerName && String(customerName).trim()) {
        // Recover cleanly if client sent a customer ID from another serverless instance before sync
        await tx.execute(
          `INSERT INTO customers (id, name, is_active) VALUES (?, ?, 1) ON CONFLICT(id) DO NOTHING`,
          [targetCustomerId, String(customerName).trim()]
        );
        resolvedCustomerName = String(customerName).trim();
      } else {
        targetCustomerId = 1;
        resolvedCustomerName = 'مشتری متفرقه (نقدی/گذری)';
      }

      // 1. Calculate items subtotal and validate product foreign keys
      let subtotal = 0;
      const calculatedItems: Array<{
        productId: number | null;
        productName: string;
        unit: string;
        quantity: number;
        unitPrice: number;
        purchasePriceSnapshot: number;
        discountAmount: number;
        totalAmount: number;
      }> = [];

      for (const it of items) {
        const qty = parseFloat(it.quantity) || 1;
        const price = Math.round(parseFloat(it.unitPrice) || 0);
        const itemDiscount = Math.round(parseFloat(it.discountAmount) || 0);
        const rowTotal = Math.max(0, Math.round(qty * price - itemDiscount));
        subtotal += rowTotal;

        let validProductId: number | null = it.productId ? Number(it.productId) : null;
        if (validProductId) {
          const prodExists = await tx.queryGet<{ id: number }>(
            'SELECT id FROM products WHERE id = ?',
            [validProductId]
          );
          if (!prodExists) validProductId = null;
        }

        calculatedItems.push({
          productId: validProductId,
          productName: it.productName || 'کالا',
          unit: it.unit || 'عدد',
          quantity: qty,
          unitPrice: price,
          purchasePriceSnapshot: Math.round(parseFloat(it.purchasePrice) || 0),
          discountAmount: itemDiscount,
          totalAmount: rowTotal
        });
      }

      // 2. Calculate final total
      let calcDiscountAmount = 0;
      if (discountType === 'percent') {
        calcDiscountAmount = Math.round(
          (subtotal * Math.min(100, Math.max(0, parseFloat(discountValue) || 0))) / 100
        );
      } else {
        calcDiscountAmount = Math.round(Math.min(subtotal, Math.max(0, parseFloat(discountValue) || 0)));
      }

      const addCharges = Math.round(Math.max(0, parseFloat(additionalCharges) || 0));
      const finalTotal = Math.max(0, subtotal - calcDiscountAmount + addCharges);

      const invoiceNum = await generateInvoiceNumber(tx);
      const resolvedIssueDate = issueDate || getTodayJalali();
      const initialStatus = isDraft ? 'draft' : 'unpaid';

      // 3. Insert Invoice
      const result = await tx.execute(
        `INSERT INTO invoices (
          invoice_number, customer_id, customer_name_snapshot, issue_date, due_date,
          subtotal, discount_type, discount_value, discount_amount, additional_charges,
          final_total, paid_amount, remaining_amount, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        [
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
          finalTotal,
          initialStatus,
          notes || ''
        ]
      );

      const invoiceId = result.lastInsertRowid;

      // 4. Insert Items & Sync Inventory Stock (if not draft)
      for (const item of calculatedItems) {
        await tx.execute(
          `INSERT INTO invoice_items (
            invoice_id, product_id, product_name, unit, quantity, unit_price,
            purchase_price_snapshot, discount_amount, total_amount
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            invoiceId,
            item.productId,
            item.productName,
            item.unit,
            item.quantity,
            item.unitPrice,
            item.purchasePriceSnapshot,
            item.discountAmount,
            item.totalAmount
          ]
        );

        if (!isDraft && item.productId) {
          await tx.execute(
            `UPDATE products
             SET quantity = MAX(0, quantity - ?), updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [item.quantity, item.productId]
          );
        }
      }

      // 5. Initial payment if provided
      const initialPay = Math.round(parseFloat(initialPaymentAmount) || 0);
      if (initialPay > 0 && !isDraft) {
        await recordPayment(
          {
            customerId: targetCustomerId,
            amount: initialPay,
            paymentDate: resolvedIssueDate,
            paymentMethod: paymentMethod || 'card_to_card',
            trackingCode: paymentTrackingCode,
            notes: `پیش‌پرداخت / پرداخت اولیه فاکتور شماره ${invoiceNum}`,
            allocations: [{ invoiceId, amount: Math.min(initialPay, finalTotal) }]
          },
          tx
        );
      }

      // 6. Recalculate status
      await recalculateInvoice(invoiceId, tx);

      // 7. Audit log & bump revision
      await tx.execute(
        `INSERT INTO audit_logs (action, entity_type, entity_id, details)
         VALUES ('create_invoice', 'invoice', ?, ?)`,
        [invoiceId, JSON.stringify({ invoiceNum, customerId: targetCustomerId, finalTotal, isDraft })]
      );
      await bumpDbRevision(tx);

      return { invoiceId, invoiceNumber: invoiceNum };
    });

    res.json({ success: true, ...out });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/invoices/:id/cancel', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { reason } = req.body;

    await runTransaction(async (tx) => {
      const inv = await tx.queryGet<any>('SELECT * FROM invoices WHERE id = ?', [id]);
      if (!inv) throw new Error('فاکتور یافت نشد.');
      if (inv.status === 'cancelled') throw new Error('این فاکتور قبلاً ابطال شده است.');

      // Return allocated payments to customer credit
      const allocations = await tx.queryAll<any>(
        'SELECT * FROM payment_allocations WHERE invoice_id = ?',
        [id]
      );
      if (allocations.length > 0) {
        for (const alloc of allocations) {
          await tx.execute(
            `INSERT INTO customer_credits (customer_id, payment_id, amount, used_amount, remaining_credit)
             VALUES (?, ?, ?, 0, ?)`,
            [inv.customer_id || 1, alloc.payment_id, alloc.amount, alloc.amount]
          );
        }
        await tx.execute('DELETE FROM payment_allocations WHERE invoice_id = ?', [id]);
      }

      // Restore inventory stock if invoice wasn't a draft
      if (inv.status !== 'draft') {
        const invItems = await tx.queryAll<any>(
          'SELECT product_id, quantity FROM invoice_items WHERE invoice_id = ? AND product_id IS NOT NULL',
          [id]
        );
        for (const item of invItems) {
          await tx.execute(
            'UPDATE products SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [item.quantity, item.product_id]
          );
        }
      }

      await tx.execute(
        `UPDATE invoices
         SET status = 'cancelled',
             paid_amount = 0,
             remaining_amount = 0,
             notes = COALESCE(notes, '') || ' [ابطال: ' || ? || ']',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [reason || 'ابطال توسط کاربر', id]
      );

      await tx.execute(
        `INSERT INTO audit_logs (action, entity_type, entity_id, details)
         VALUES ('cancel_invoice', 'invoice', ?, ?)`,
        [id, JSON.stringify({ reason })]
      );

      await bumpDbRevision(tx);
    });

    res.json({ success: true, message: 'فاکتور با موفقیت ابطال شد.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ======================== PAYMENTS ========================

apiRouter.get('/payments', requireAuth, async (req: Request, res: Response) => {
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

    const payments = await dbQueryAll<any>(query, params);
    const withAllocations = await Promise.all(
      payments.map(async (p) => {
        const allocs = await dbQueryAll(
          `SELECT pa.amount, i.invoice_number, i.id as invoice_id
           FROM payment_allocations pa
           JOIN invoices i ON i.id = pa.invoice_id
           WHERE pa.payment_id = ?`,
          [p.id]
        );
        return { ...p, allocations: allocs };
      })
    );

    res.json(withAllocations);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/payments', requireAuth, async (req: Request, res: Response) => {
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

    const result = await recordPayment({
      customerId: Number(customerId),
      amount: Number(amount),
      paymentDate: paymentDate || getTodayJalali(),
      paymentMethod: paymentMethod || 'card_to_card',
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

apiRouter.post('/payments/:id/refund', requireAuth, async (req: Request, res: Response) => {
  try {
    const paymentId = parseInt(req.params.id, 10);
    const { reason } = req.body;
    const result = await refundOrVoidPayment(paymentId, reason || 'استرداد وجه');
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.post('/customers/:id/apply-credit', requireAuth, async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id, 10);
    const { invoiceId, amount } = req.body;
    const result = await applyCustomerCredit(customerId, Number(invoiceId), Number(amount));
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ======================== EXPENSES ========================

apiRouter.get('/expenses', requireAuth, async (_req: Request, res: Response) => {
  try {
    const list = await dbQueryAll('SELECT * FROM expenses ORDER BY id DESC');
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/expenses', requireAuth, async (req: Request, res: Response) => {
  try {
    const { title, category, amount, expenseDate, paymentMethod, notes } = req.body;
    if (!title || !Number(amount)) {
      return res.status(400).json({ error: 'عنوان و مبلغ هزینه الزامی است.' });
    }
    const id = await runTransaction(async (tx) => {
      const resIns = await tx.execute(
        `INSERT INTO expenses (title, category, amount, expense_date, payment_method, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          String(title).trim(),
          category || 'عمومی',
          Math.round(Number(amount)),
          expenseDate || getTodayJalali(),
          paymentMethod || 'cash',
          notes || null
        ]
      );
      await bumpDbRevision(tx);
      return resIns.lastInsertRowid;
    });
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/expenses/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    await runTransaction(async (tx) => {
      await tx.execute('DELETE FROM expenses WHERE id = ?', [id]);
      await bumpDbRevision(tx);
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ======================== RECEIVABLES & DEBTORS ========================

apiRouter.get('/receivables', requireAuth, async (_req: Request, res: Response) => {
  try {
    const customers = await dbQueryAll<any>(
      'SELECT id, name, phone, address FROM customers WHERE is_active = 1'
    );
    const debtors = [];
    let totalOutstandingAmount = 0;

    for (const c of customers) {
      const summary = await getCustomerFinancialSummary(Number(c.id));
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

apiRouter.get('/dashboard', requireAuth, async (_req: Request, res: Response) => {
  try {
    const today = getTodayJalali();
    const currentYearMonth = today.substring(0, 7);

    const [
      todaySalesRow,
      monthSalesRow,
      todayReceiptsRow,
      monthReceiptsRow,
      allCustomers,
      invoiceCountRow,
      profitRow,
      salesTrend,
      topProducts,
      topCustomers
    ] = await Promise.all([
      dbQueryGet<any>(
        `SELECT COALESCE(SUM(final_total), 0) as s, COUNT(*) as c
         FROM invoices
         WHERE issue_date = ? AND status != 'cancelled' AND status != 'draft'`,
        [today]
      ),
      dbQueryGet<any>(
        `SELECT COALESCE(SUM(final_total), 0) as s
         FROM invoices
         WHERE issue_date LIKE ? AND status != 'cancelled' AND status != 'draft'`,
        [`${currentYearMonth}%`]
      ),
      dbQueryGet<any>(
        `SELECT COALESCE(SUM(amount), 0) as r
         FROM payments
         WHERE payment_date = ? AND status = 'valid'`,
        [today]
      ),
      dbQueryGet<any>(
        `SELECT COALESCE(SUM(amount), 0) as r
         FROM payments
         WHERE payment_date LIKE ? AND status = 'valid'`,
        [`${currentYearMonth}%`]
      ),
      dbQueryAll<any>('SELECT id FROM customers WHERE is_active = 1'),
      dbQueryGet<any>(
        `SELECT
          COUNT(CASE WHEN issue_date = ? THEN 1 END) as today_invoices,
          COUNT(CASE WHEN remaining_amount > 0 AND status != 'cancelled' AND status != 'draft' THEN 1 END) as unpaid_invoices
         FROM invoices`,
        [today]
      ),
      dbQueryGet<any>(
        `SELECT COALESCE(SUM(ii.total_amount - (ii.quantity * ii.purchase_price_snapshot)), 0) as gross_profit
         FROM invoice_items ii
         JOIN invoices i ON i.id = ii.invoice_id
         WHERE i.status != 'cancelled' AND i.status != 'draft' AND ii.purchase_price_snapshot > 0`
      ),
      dbQueryAll<any>(
        `SELECT issue_date as date, SUM(final_total) as sales, SUM(paid_amount) as receipts
         FROM invoices
         WHERE status != 'cancelled' AND status != 'draft'
         GROUP BY issue_date
         ORDER BY issue_date DESC
         LIMIT 14`
      ),
      dbQueryAll<any>(
        `SELECT product_name, SUM(quantity) as total_qty, SUM(total_amount) as total_amount
         FROM invoice_items ii
         JOIN invoices i ON i.id = ii.invoice_id
         WHERE i.status != 'cancelled' AND i.status != 'draft'
         GROUP BY product_name
         ORDER BY total_amount DESC
         LIMIT 6`
      ),
      dbQueryAll<any>(
        `SELECT c.name, SUM(i.final_total) as total_spent, COUNT(i.id) as invoice_count
         FROM invoices i
         JOIN customers c ON c.id = i.customer_id
         WHERE i.status != 'cancelled' AND i.status != 'draft'
         GROUP BY c.id
         ORDER BY total_spent DESC
         LIMIT 5`
      )
    ]);

    let totalReceivables = 0;
    let debtorCount = 0;
    for (const c of allCustomers) {
      const summary = await getCustomerFinancialSummary(Number(c.id));
      if (summary.netBalance > 0) {
        totalReceivables += summary.netBalance;
        debtorCount++;
      }
    }

    res.json({
      todaySales: Number(todaySalesRow?.s || 0),
      monthSales: Number(monthSalesRow?.s || 0),
      todayReceipts: Number(todayReceiptsRow?.r || 0),
      monthReceipts: Number(monthReceiptsRow?.r || 0),
      totalReceivables,
      debtorCount,
      todayInvoicesCount: Number(invoiceCountRow?.today_invoices || 0),
      unpaidInvoicesCount: Number(invoiceCountRow?.unpaid_invoices || 0),
      estimatedGrossProfit: Number(profitRow?.gross_profit || 0),
      salesTrend: [...salesTrend].reverse(),
      topProducts,
      topCustomers
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ======================== EXPORT REPORTS ========================

apiRouter.get('/reports/excel', requireAuth, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const buffer = await generateComprehensiveExcelReport({
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
    const customer = await dbQueryGet<any>('SELECT name FROM customers WHERE id = ?', [customerId]);
    if (!customer) {
      return res.status(404).json({ error: 'مشتری یافت نشد.' });
    }
    const buffer = await generateCustomerPdfReport(customerId);

    const safeName = (customer.name || 'مشتری').trim();
    const filename = `${safeName}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', buffer.length.toString());
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type, Content-Length');
    const asciiFallback = `Customer_${customerId}.pdf`;
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/reports/word/:customerId', requireAuth, async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.customerId, 10);
    const buffer = await generateCustomerWordReport(customerId);

    const customer = await dbQueryGet<any>('SELECT name FROM customers WHERE id = ?', [customerId]);
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

apiRouter.get('/backup/download', requireAuth, async (_req: Request, res: Response) => {
  try {
    if (dbDriver === 'turso') {
      // Export full JSON snapshot when hosted on Turso Cloud
      const snapshot = await exportFullSnapshot();
      const filename = `hesabyar_cloud_backup_${getTodayJalali().replace(/\//g, '-')}.json`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(JSON.stringify(snapshot, null, 2));
    }

    const sqlite = getRawSqliteDb();
    if (sqlite) {
      sqlite.pragma('wal_checkpoint(TRUNCATE)');
    }
    const filename = `hesabyar_backup_${getTodayJalali().replace(/\//g, '-')}.db`;
    res.download(DB_PATH, filename);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/backup/json', requireAuth, async (_req: Request, res: Response) => {
  try {
    const dump = await exportFullSnapshot();
    const payload = JSON.stringify(dump, null, 2);
    const filename = `hesabyar_dump_${getTodayJalali().replace(/\//g, '-')}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(payload);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/backup/restore-json', requireAuth, async (req: Request, res: Response) => {
  try {
    const dump = req.body;
    if (!dump || typeof dump !== 'object') {
      return res.status(400).json({ error: 'فرمت داده‌های بازیابی معتبر نیست.' });
    }

    const restored = await mergeOrRestoreSnapshot(dump, 'replace');
    res.json({
      success: true,
      message: 'بازیابی اطلاعات تمام جداول دیتابیس با موفقیت انجام شد.',
      snapshot: restored
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
