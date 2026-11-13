import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { createClient, Client, InArgs } from '@libsql/client';

export type DbDriver = 'turso' | 'sqlite';

export interface RunResult {
  lastInsertRowid: number;
  changes: number;
}

export interface DbSession {
  queryAll<T = any>(sql: string, params?: any[]): Promise<T[]>;
  queryGet<T = any>(sql: string, params?: any[]): Promise<T | undefined>;
  execute(sql: string, params?: any[]): Promise<RunResult>;
  execRaw(sql: string): Promise<void>;
}

const isVercel = Boolean(process.env.VERCEL || process.env.NOW_REGION);
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : isVercel
  ? '/tmp/hesabyar_data'
  : path.resolve(process.cwd(), 'data');

export const DB_PATH = path.join(DATA_DIR, 'hesabyar.db');

const TURSO_URL = process.env.TURSO_DATABASE_URL?.trim();
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN?.trim();
const useTurso = Boolean(TURSO_URL && TURSO_TOKEN);

export const dbDriver: DbDriver = useTurso ? 'turso' : 'sqlite';

let sqliteDb: Database.Database | null = null;
let tursoClient: Client | null = null;

if (useTurso) {
  tursoClient = createClient({
    url: TURSO_URL!,
    authToken: TURSO_TOKEN!
  });
} else {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  sqliteDb = new Database(DB_PATH);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');
  sqliteDb.pragma('synchronous = NORMAL');
  sqliteDb.pragma('busy_timeout = 5000');
}

export function getRawSqliteDb(): Database.Database | null {
  return sqliteDb;
}

// Async write lock to serialize SQLite transactions safely
let writeLockChain: Promise<void> = Promise.resolve();

function withSqliteWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeLockChain.then(fn, fn);
  writeLockChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function normalizeLibsqlRow(row: any): any {
  if (!row || typeof row !== 'object') return row;
  const out: Record<string, any> = {};
  for (const key of Object.keys(row)) {
    // Skip numeric indices from libsql Row object
    if (/^\d+$/.test(key)) continue;
    const val = row[key];
    out[key] = typeof val === 'bigint' ? Number(val) : val;
  }
  return out;
}

function toLibsqlArgs(params: any[] = []): InArgs {
  return params.map((p) => (p === undefined ? null : p));
}

function toSqliteParams(params: any[] = []): any[] {
  return params.map((p) => (p === undefined ? null : p));
}

function createSqliteSession(conn: Database.Database): DbSession {
  return {
    async queryAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
      return conn.prepare(sql).all(...toSqliteParams(params)) as T[];
    },
    async queryGet<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
      return conn.prepare(sql).get(...toSqliteParams(params)) as T | undefined;
    },
    async execute(sql: string, params: any[] = []): Promise<RunResult> {
      const res = conn.prepare(sql).run(...toSqliteParams(params));
      return {
        lastInsertRowid: Number(res.lastInsertRowid ?? 0),
        changes: res.changes ?? 0
      };
    },
    async execRaw(sql: string): Promise<void> {
      conn.exec(sql);
    }
  };
}

function createTursoSession(executor: Pick<Client, 'execute' | 'executeMultiple'>): DbSession {
  return {
    async queryAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
      const res = await executor.execute({ sql, args: toLibsqlArgs(params) });
      return res.rows.map(normalizeLibsqlRow) as T[];
    },
    async queryGet<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
      const res = await executor.execute({ sql, args: toLibsqlArgs(params) });
      return res.rows.length > 0 ? (normalizeLibsqlRow(res.rows[0]) as T) : undefined;
    },
    async execute(sql: string, params: any[] = []): Promise<RunResult> {
      const res = await executor.execute({ sql, args: toLibsqlArgs(params) });
      return {
        lastInsertRowid: Number(res.lastInsertRowid ?? 0),
        changes: res.rowsAffected ?? 0
      };
    },
    async execRaw(sql: string): Promise<void> {
      await executor.executeMultiple(sql);
    }
  };
}

export const dbSession: DbSession = useTurso
  ? createTursoSession(tursoClient!)
  : createSqliteSession(sqliteDb!);

export async function dbQueryAll<T = any>(sql: string, params: any[] = [], tx?: DbSession): Promise<T[]> {
  return (tx || dbSession).queryAll<T>(sql, params);
}

export async function dbQueryGet<T = any>(sql: string, params: any[] = [], tx?: DbSession): Promise<T | undefined> {
  return (tx || dbSession).queryGet<T>(sql, params);
}

export async function dbExecute(sql: string, params: any[] = [], tx?: DbSession): Promise<RunResult> {
  return (tx || dbSession).execute(sql, params);
}

export async function dbExecRaw(sql: string, tx?: DbSession): Promise<void> {
  return (tx || dbSession).execRaw(sql);
}

export async function runTransaction<T>(fn: (tx: DbSession) => Promise<T>): Promise<T> {
  if (useTurso && tursoClient) {
    const tx = await tursoClient.transaction('write');
    try {
      const session = createTursoSession(tx as any);
      await session.execute('PRAGMA foreign_keys = ON');
      const result = await fn(session);
      await tx.commit();
      return result;
    } catch (err) {
      try {
        await tx.rollback();
      } catch {}
      throw err;
    }
  }

  return withSqliteWriteLock(async () => {
    const conn = sqliteDb!;
    const session = createSqliteSession(conn);
    conn.exec('BEGIN IMMEDIATE');
    try {
      const result = await fn(session);
      conn.exec('COMMIT');
      return result;
    } catch (err) {
      try {
        conn.exec('ROLLBACK');
      } catch {}
      throw err;
    }
  });
}

const SCHEMA_STATEMENTS: string[] = [
  `PRAGMA foreign_keys = ON`,
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS sync_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    notes TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'مواد غذایی',
    quantity REAL DEFAULT 0,
    code TEXT,
    unit TEXT DEFAULT 'عدد',
    default_sale_price INTEGER DEFAULT 0,
    purchase_price INTEGER DEFAULT 0,
    notes TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS invoices (
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
    status TEXT NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS invoice_items (
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
  )`,
  `CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    payment_date TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    tracking_code TEXT,
    notes TEXT,
    idempotency_key TEXT UNIQUE,
    status TEXT DEFAULT 'valid',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
  )`,
  `CREATE TABLE IF NOT EXISTS payment_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_id INTEGER NOT NULL,
    invoice_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS customer_credits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    payment_id INTEGER,
    amount INTEGER NOT NULL,
    used_amount INTEGER DEFAULT 0,
    remaining_credit INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    amount INTEGER NOT NULL,
    expense_date TEXT NOT NULL,
    payment_method TEXT DEFAULT 'cash',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS financial_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    adjustment_type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status)`,
  `CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON invoices(issue_date)`,
  `CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)`,
  `CREATE INDEX IF NOT EXISTS idx_payment_alloc_invoice ON payment_allocations(invoice_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payment_alloc_payment ON payment_allocations(payment_id)`,
  `CREATE INDEX IF NOT EXISTS idx_customer_credits_customer ON customer_credits(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date)`
];

const MIGRATION_STATEMENTS: string[] = [
  `ALTER TABLE products ADD COLUMN category TEXT DEFAULT 'مواد غذایی'`,
  `ALTER TABLE products ADD COLUMN quantity REAL DEFAULT 0`,
  `ALTER TABLE products ADD COLUMN updated_at DATETIME`,
  `ALTER TABLE customers ADD COLUMN updated_at DATETIME`,
  `ALTER TABLE payments ADD COLUMN updated_at DATETIME`,
  `ALTER TABLE users ADD COLUMN updated_at DATETIME`,
  `ALTER TABLE app_settings ADD COLUMN updated_at DATETIME`
];

let initPromise: Promise<void> | null = null;

async function performInit(): Promise<void> {
  for (const stmt of SCHEMA_STATEMENTS) {
    await dbExecute(stmt);
  }

  for (const mig of MIGRATION_STATEMENTS) {
    try {
      await dbExecute(mig);
    } catch {
      // Column already exists
    }
  }

  // Seed default store settings
  const existingSettings = await dbQueryGet<{ count: number }>('SELECT COUNT(*) as count FROM app_settings');
  if (!existingSettings || Number(existingSettings.count) === 0) {
    const defaults: Array<[string, string]> = [
      ['store_name', 'فروشگاه حاج کریم و پسران'],
      ['store_phone', '۰۲۱-۸۸۸۸۹۹۹۹'],
      ['store_address', 'تهران، بازار بزرگ، سرای حاج کریم'],
      ['invoice_header_note', 'از خرید و اعتماد شما سپاسگزاریم.'],
      ['invoice_footer_note', 'اجناس فروخته شده تا ۴۸ ساعت با ارائه فاکتور قابل تعویض می‌باشند.'],
      ['currency', 'تومان']
    ];
    for (const [k, v] of defaults) {
      await dbExecute(
        'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING',
        [k, v]
      );
    }
  } else {
    await dbExecute(
      "UPDATE app_settings SET value = 'فروشگاه حاج کریم و پسران' WHERE key = 'store_name' AND (value = 'فروشگاه پارس' OR value = '')"
    );
  }

  // Seed sync metadata revision
  await dbExecute(
    "INSERT INTO sync_metadata (key, value) VALUES ('db_revision', '1') ON CONFLICT(key) DO NOTHING"
  );

  // Seed default admin user if no users exist
  const existingUsers = await dbQueryGet<{ count: number }>('SELECT COUNT(*) as count FROM users');
  if (!existingUsers || Number(existingUsers.count) === 0) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync('admin123', salt);
    await dbExecute(
      'INSERT INTO users (username, password_hash, full_name) VALUES (?, ?, ?) ON CONFLICT(username) DO NOTHING',
      ['admin', hash, 'صاحب فروشگاه']
    );
  }

  // Ensure default walk-in customer (id = 1) exists
  const existingWalkIn = await dbQueryGet<{ id: number }>('SELECT id FROM customers WHERE id = 1');
  if (!existingWalkIn) {
    await dbExecute(
      'INSERT INTO customers (id, name, phone, notes, is_active) VALUES (1, ?, ?, ?, 1) ON CONFLICT(id) DO NOTHING',
      ['مشتری متفرقه (نقدی/گذری)', '', 'مشتری پیش‌فرض فروش‌های سریع و نقدی']
    );
  }
}

export async function ensureDbInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = performInit().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

export async function initDatabase(): Promise<void> {
  return ensureDbInitialized();
}

export async function bumpDbRevision(tx?: DbSession): Promise<number> {
  const row = await dbQueryGet<{ value: string }>(
    "SELECT value FROM sync_metadata WHERE key = 'db_revision'",
    [],
    tx
  );
  const nextRev = (parseInt(row?.value || '1', 10) || 1) + 1;
  await dbExecute(
    `INSERT INTO sync_metadata (key, value, updated_at)
     VALUES ('db_revision', ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    [String(nextRev)],
    tx
  );
  return nextRev;
}

export async function getDbRevision(tx?: DbSession): Promise<number> {
  const row = await dbQueryGet<{ value: string }>(
    "SELECT value FROM sync_metadata WHERE key = 'db_revision'",
    [],
    tx
  );
  return parseInt(row?.value || '1', 10) || 1;
}

export async function getDbHealth() {
  await ensureDbInitialized();
  const [customers, products, invoices, payments, expenses, settings, revision] = await Promise.all([
    dbQueryGet<{ c: number }>('SELECT COUNT(*) as c FROM customers WHERE is_active = 1'),
    dbQueryGet<{ c: number }>('SELECT COUNT(*) as c FROM products WHERE is_active = 1'),
    dbQueryGet<{ c: number }>('SELECT COUNT(*) as c FROM invoices'),
    dbQueryGet<{ c: number }>('SELECT COUNT(*) as c FROM payments'),
    dbQueryGet<{ c: number }>('SELECT COUNT(*) as c FROM expenses'),
    dbQueryGet<{ c: number }>('SELECT COUNT(*) as c FROM app_settings'),
    getDbRevision()
  ]);

  return {
    driver: dbDriver,
    persistentCloud: dbDriver === 'turso',
    dbPath: dbDriver === 'sqlite' ? DB_PATH : null,
    revision,
    counts: {
      customers: Number(customers?.c || 0),
      products: Number(products?.c || 0),
      invoices: Number(invoices?.c || 0),
      payments: Number(payments?.c || 0),
      expenses: Number(expenses?.c || 0),
      settings: Number(settings?.c || 0)
    }
  };
}
