import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { createClient, Client } from '@libsql/client';

const isVercel = Boolean(process.env.VERCEL || process.env.NOW_REGION);
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : isVercel
  ? '/tmp/hesabyar_data'
  : path.resolve(process.cwd(), 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const DB_PATH = path.join(DATA_DIR, 'hesabyar.db');

export const db: Database.Database = new Database(DB_PATH);

// Configure SQLite for high performance and integrity
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

// Turso Cloud Sync (Embedded Replica)
let tursoSyncClient: Client | null = null;
if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
  try {
    tursoSyncClient = createClient({
      url: `file:${DB_PATH}`,
      syncUrl: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN
    });
    console.log('⚡ Turso Cloud Database Sync initialized successfully.');
  } catch (err) {
    console.warn('Turso initialization notice:', err);
  }
}

export async function syncTursoDatabase() {
  if (tursoSyncClient && typeof tursoSyncClient.sync === 'function') {
    try {
      await tursoSyncClient.sync();
    } catch (err) {
      console.warn('Turso sync notice:', err);
    }
  }
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'عمومی',
      quantity REAL DEFAULT 0,
      code TEXT,
      unit TEXT DEFAULT 'عدد',
      default_sale_price INTEGER DEFAULT 0,
      purchase_price INTEGER DEFAULT 0,
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      customer_id INTEGER,
      customer_name_snapshot TEXT NOT NULL,
      issue_date TEXT NOT NULL,
      due_date TEXT,
      subtotal INTEGER NOT NULL,
      discount_type TEXT DEFAULT 'amount',
      discount_value INTEGER DEFAULT 0,
      discount_amount INTEGER DEFAULT 0,
      additional_charges INTEGER DEFAULT 0,
      final_total INTEGER NOT NULL,
      paid_amount INTEGER DEFAULT 0,
      remaining_amount INTEGER NOT NULL,
      status TEXT NOT NULL, -- 'draft', 'unpaid', 'partially_paid', 'paid', 'adjusted', 'cancelled'
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      unit TEXT DEFAULT 'عدد',
      quantity REAL NOT NULL,
      unit_price INTEGER NOT NULL,
      purchase_price_snapshot INTEGER DEFAULT 0,
      discount_amount INTEGER DEFAULT 0,
      total_amount INTEGER NOT NULL,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      payment_date TEXT NOT NULL,
      payment_method TEXT NOT NULL, -- 'cash', 'pos', 'bank_transfer', 'other'
      tracking_code TEXT,
      notes TEXT,
      idempotency_key TEXT UNIQUE,
      status TEXT DEFAULT 'valid', -- 'valid', 'refunded', 'voided'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS payment_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id INTEGER NOT NULL,
      invoice_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS customer_credits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      payment_id INTEGER,
      amount INTEGER NOT NULL,
      used_amount INTEGER DEFAULT 0,
      remaining_credit INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      amount INTEGER NOT NULL,
      expense_date TEXT NOT NULL,
      payment_method TEXT DEFAULT 'cash',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS financial_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL, -- 'invoice', 'payment', 'customer'
      entity_id INTEGER NOT NULL,
      adjustment_type TEXT NOT NULL, -- 'discount', 'refund', 'write_off', 'correction'
      amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
    CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
    CREATE INDEX IF NOT EXISTS idx_payment_alloc_invoice ON payment_allocations(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_payment_alloc_payment ON payment_allocations(payment_id);
    CREATE INDEX IF NOT EXISTS idx_customer_credits_customer ON customer_credits(customer_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
  `);

  // Migrations for products category and quantity
  try {
    db.exec("ALTER TABLE products ADD COLUMN category TEXT DEFAULT 'عمومی'");
  } catch {}
  try {
    db.exec("ALTER TABLE products ADD COLUMN quantity REAL DEFAULT 0");
  } catch {}

  // Default initial store settings if not exists
  const existingSettings = db.prepare('SELECT COUNT(*) as count FROM app_settings').get() as { count: number };
  if (existingSettings.count === 0) {
    const insertSetting = db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)');
    insertSetting.run('store_name', 'فروشگاه حاج کریم و پسران');
    insertSetting.run('store_phone', '۰۲۱-۸۸۸۸۹۹۹۹');
    insertSetting.run('store_address', 'تهران، بازار بزرگ، سرای حاج کریم');
    insertSetting.run('invoice_header_note', 'از خرید و اعتماد شما سپاسگزاریم.');
    insertSetting.run('invoice_footer_note', 'اجناس فروخته شده تا ۴۸ ساعت با ارائه فاکتور قابل تعویض می‌باشند.');
    insertSetting.run('currency', 'تومان');
  } else {
    // If store_name was still the default placeholder, update to user's desired name
    db.prepare("UPDATE app_settings SET value = 'فروشگاه حاج کریم و پسران' WHERE key = 'store_name' AND (value = 'فروشگاه پارس' OR value = '')").run();
  }

  // Seed default admin user if no users exist
  const existingUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (existingUsers.count === 0) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync('admin123', salt);
    db.prepare('INSERT INTO users (username, password_hash, full_name) VALUES (?, ?, ?)').run(
      'admin',
      hash,
      'صاحب فروشگاه'
    );
  }

  // Ensure default "مشتری متفرقه" exists for quick POS walk-in sales
  const existingWalkIn = db.prepare('SELECT id FROM customers WHERE id = 1').get();
  if (!existingWalkIn) {
    db.prepare('INSERT OR IGNORE INTO customers (id, name, phone, notes) VALUES (1, ?, ?, ?)').run(
      'مشتری متفرقه (نقدی/گذری)',
      '',
      'مشتری پیش‌فرض فروش‌های سریع و نقدی'
    );
  }
}
