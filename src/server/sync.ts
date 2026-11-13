import {
  DbSession,
  dbDriver,
  dbQueryAll,
  dbQueryGet,
  dbExecute,
  runTransaction,
  ensureDbInitialized,
  getDbRevision,
  bumpDbRevision
} from './db.js';
import { recalculateInvoice } from './finance.js';

export interface FullDbSnapshot {
  version: 2;
  revision: number;
  driver: 'turso' | 'sqlite';
  exportedAt: string;
  app_settings: any[];
  customers: any[];
  products: any[];
  invoices: any[];
  invoice_items: any[];
  payments: any[];
  payment_allocations: any[];
  customer_credits: any[];
  expenses: any[];
  financial_adjustments: any[];
  audit_logs: any[];
}

const SEQUENCE_TABLES = [
  'customers',
  'products',
  'invoices',
  'invoice_items',
  'payments',
  'payment_allocations',
  'customer_credits',
  'expenses',
  'financial_adjustments',
  'audit_logs'
];

export async function syncSqliteSequences(tx?: DbSession): Promise<void> {
  try {
    const seqTable = await dbQueryGet<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'",
      [],
      tx
    );
    if (!seqTable) return;

    for (const table of SEQUENCE_TABLES) {
      const maxRow = await dbQueryGet<{ max_id: number | null }>(
        `SELECT MAX(id) as max_id FROM ${table}`,
        [],
        tx
      );
      const maxId = Number(maxRow?.max_id || 0);
      if (maxId > 0) {
        const existingSeq = await dbQueryGet<{ seq: number }>(
          'SELECT seq FROM sqlite_sequence WHERE name = ?',
          [table],
          tx
        );
        if (existingSeq) {
          if (Number(existingSeq.seq) < maxId) {
            await dbExecute('UPDATE sqlite_sequence SET seq = ? WHERE name = ?', [maxId, table], tx);
          }
        } else {
          await dbExecute('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)', [table, maxId], tx);
        }
      }
    }
  } catch (err) {
    console.warn('sqlite_sequence sync notice:', err);
  }
}

export async function reconcileAllFinancials(tx?: DbSession): Promise<{
  invoicesRecalculated: number;
  revision: number;
}> {
  const work = async (s: DbSession) => {
    // Ensure default walk-in customer (id = 1)
    await s.execute(
      `INSERT INTO customers (id, name, phone, notes, is_active)
       VALUES (1, ?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET is_active = 1`,
      ['مشتری متفرقه (نقدی/گذری)', '', 'مشتری پیش‌فرض فروش‌های سریع و نقدی']
    );

    const invoices = await s.queryAll<{ id: number }>(
      "SELECT id FROM invoices WHERE status != 'cancelled'"
    );
    for (const inv of invoices) {
      await recalculateInvoice(Number(inv.id), s);
    }

    await syncSqliteSequences(s);
    const revision = await bumpDbRevision(s);
    return {
      invoicesRecalculated: invoices.length,
      revision
    };
  };

  if (tx) return work(tx);
  await ensureDbInitialized();
  return runTransaction(work);
}

export async function exportFullSnapshot(tx?: DbSession): Promise<FullDbSnapshot> {
  if (!tx) await ensureDbInitialized();
  const [
    revision,
    app_settings,
    customers,
    products,
    invoices,
    invoice_items,
    payments,
    payment_allocations,
    customer_credits,
    expenses,
    financial_adjustments,
    audit_logs
  ] = await Promise.all([
    getDbRevision(tx),
    dbQueryAll('SELECT * FROM app_settings ORDER BY key ASC', [], tx),
    dbQueryAll('SELECT * FROM customers ORDER BY id ASC', [], tx),
    dbQueryAll('SELECT * FROM products ORDER BY id ASC', [], tx),
    dbQueryAll('SELECT * FROM invoices ORDER BY id ASC', [], tx),
    dbQueryAll('SELECT * FROM invoice_items ORDER BY id ASC', [], tx),
    dbQueryAll('SELECT * FROM payments ORDER BY id ASC', [], tx),
    dbQueryAll('SELECT * FROM payment_allocations ORDER BY id ASC', [], tx),
    dbQueryAll('SELECT * FROM customer_credits ORDER BY id ASC', [], tx),
    dbQueryAll('SELECT * FROM expenses ORDER BY id ASC', [], tx),
    dbQueryAll('SELECT * FROM financial_adjustments ORDER BY id ASC', [], tx),
    dbQueryAll('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 500', [], tx)
  ]);

  return {
    version: 2,
    revision,
    driver: dbDriver,
    exportedAt: new Date().toISOString(),
    app_settings,
    customers,
    products,
    invoices,
    invoice_items,
    payments,
    payment_allocations,
    customer_credits,
    expenses,
    financial_adjustments,
    audit_logs: [...audit_logs].reverse()
  };
}

export async function mergeOrRestoreSnapshot(
  dump: Record<string, any>,
  mode: 'merge' | 'replace' = 'merge'
): Promise<FullDbSnapshot> {
  await ensureDbInitialized();

  return runTransaction(async (tx) => {
    if (mode === 'replace') {
      // Clear tables in reverse FK order (keep users & sessions intact)
      const clearOrder = [
        'audit_logs',
        'financial_adjustments',
        'payment_allocations',
        'customer_credits',
        'invoice_items',
        'payments',
        'invoices',
        'expenses',
        'products',
        'customers',
        'app_settings'
      ];
      for (const tbl of clearOrder) {
        await tx.execute(`DELETE FROM ${tbl}`);
      }
    }

    // 1. app_settings
    if (Array.isArray(dump.app_settings)) {
      for (const s of dump.app_settings) {
        if (!s || !s.key) continue;
        await tx.execute(
          `INSERT INTO app_settings (key, value, updated_at)
           VALUES (?, ?, COALESCE(?, CURRENT_TIMESTAMP))
           ON CONFLICT(key) DO UPDATE SET
             value = excluded.value,
             updated_at = CURRENT_TIMESTAMP`,
          [String(s.key), String(s.value ?? ''), s.updated_at || null]
        );
      }
    }

    // Ensure default walk-in customer (id = 1) exists before FK inserts
    await tx.execute(
      `INSERT INTO customers (id, name, phone, notes, is_active)
       VALUES (1, ?, ?, ?, 1)
       ON CONFLICT(id) DO NOTHING`,
      ['مشتری متفرقه (نقدی/گذری)', '', 'مشتری پیش‌فرض فروش‌های سریع و نقدی']
    );

    // 2. customers (safe UPSERT, never INSERT OR REPLACE)
    if (Array.isArray(dump.customers)) {
      for (const c of dump.customers) {
        if (!c || !c.id || !c.name) continue;
        await tx.execute(
          `INSERT INTO customers (id, name, phone, address, notes, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             phone = excluded.phone,
             address = excluded.address,
             notes = excluded.notes,
             is_active = excluded.is_active,
             updated_at = CURRENT_TIMESTAMP`,
          [
            Number(c.id),
            String(c.name).trim(),
            c.phone ?? null,
            c.address ?? null,
            c.notes ?? null,
            c.is_active !== undefined ? Number(c.is_active) : 1,
            c.created_at || null,
            c.updated_at || null
          ]
        );
      }
    }

    // 3. products (all columns including category & quantity, safe UPSERT)
    if (Array.isArray(dump.products)) {
      for (const p of dump.products) {
        if (!p || !p.id || !p.name) continue;
        await tx.execute(
          `INSERT INTO products (id, name, category, quantity, code, unit, default_sale_price, purchase_price, notes, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             category = excluded.category,
             quantity = excluded.quantity,
             code = excluded.code,
             unit = excluded.unit,
             default_sale_price = excluded.default_sale_price,
             purchase_price = excluded.purchase_price,
             notes = excluded.notes,
             is_active = excluded.is_active,
             updated_at = CURRENT_TIMESTAMP`,
          [
            Number(p.id),
            String(p.name).trim(),
            p.category || 'مواد غذایی',
            Number(p.quantity ?? 0),
            p.code ?? null,
            p.unit || 'عدد',
            Math.round(Number(p.default_sale_price ?? 0)),
            Math.round(Number(p.purchase_price ?? 0)),
            p.notes ?? null,
            p.is_active !== undefined ? Number(p.is_active) : 1,
            p.created_at || null,
            p.updated_at || null
          ]
        );
      }
    }

    // Build sets of valid parent IDs to prevent FK errors during partial/out-of-order sync
    const customerRows = await tx.queryAll<{ id: number }>('SELECT id FROM customers');
    const validCustomerIds = new Set(customerRows.map((r) => Number(r.id)));
    const productRows = await tx.queryAll<{ id: number }>('SELECT id FROM products');
    const validProductIds = new Set(productRows.map((r) => Number(r.id)));

    // 4. invoices
    if (Array.isArray(dump.invoices)) {
      for (const inv of dump.invoices) {
        if (!inv || !inv.id || !inv.invoice_number) continue;
        const custId =
          inv.customer_id && validCustomerIds.has(Number(inv.customer_id))
            ? Number(inv.customer_id)
            : 1;

        // Avoid invoice_number collision if merging across two independent instances
        const existingByNum = await tx.queryGet<{ id: number }>(
          'SELECT id FROM invoices WHERE invoice_number = ? AND id != ?',
          [inv.invoice_number, Number(inv.id)]
        );
        const safeInvNum = existingByNum ? `${inv.invoice_number}-${inv.id}` : inv.invoice_number;

        await tx.execute(
          `INSERT INTO invoices (
            id, invoice_number, customer_id, customer_name_snapshot, issue_date, due_date,
            subtotal, discount_type, discount_value, discount_amount, additional_charges,
            final_total, paid_amount, remaining_amount, status, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))
          ON CONFLICT(id) DO UPDATE SET
            invoice_number = excluded.invoice_number,
            customer_id = excluded.customer_id,
            customer_name_snapshot = excluded.customer_name_snapshot,
            issue_date = excluded.issue_date,
            due_date = excluded.due_date,
            subtotal = excluded.subtotal,
            discount_type = excluded.discount_type,
            discount_value = excluded.discount_value,
            discount_amount = excluded.discount_amount,
            additional_charges = excluded.additional_charges,
            final_total = excluded.final_total,
            paid_amount = excluded.paid_amount,
            remaining_amount = excluded.remaining_amount,
            status = excluded.status,
            notes = excluded.notes,
            updated_at = CURRENT_TIMESTAMP`,
          [
            Number(inv.id),
            safeInvNum,
            custId,
            inv.customer_name_snapshot || 'مشتری',
            inv.issue_date,
            inv.due_date ?? null,
            Math.round(Number(inv.subtotal ?? 0)),
            inv.discount_type || 'amount',
            Math.round(Number(inv.discount_value ?? 0)),
            Math.round(Number(inv.discount_amount ?? 0)),
            Math.round(Number(inv.additional_charges ?? 0)),
            Math.round(Number(inv.final_total ?? 0)),
            Math.round(Number(inv.paid_amount ?? 0)),
            Math.round(Number(inv.remaining_amount ?? 0)),
            inv.status || 'unpaid',
            inv.notes ?? '',
            inv.created_at || null,
            inv.updated_at || null
          ]
        );
      }
    }

    const invoiceRows = await tx.queryAll<{ id: number }>('SELECT id FROM invoices');
    const validInvoiceIds = new Set(invoiceRows.map((r) => Number(r.id)));

    // 5. invoice_items
    if (Array.isArray(dump.invoice_items)) {
      for (const it of dump.invoice_items) {
        if (!it || !it.id || !validInvoiceIds.has(Number(it.invoice_id))) continue;
        const prodId =
          it.product_id && validProductIds.has(Number(it.product_id)) ? Number(it.product_id) : null;
        await tx.execute(
          `INSERT INTO invoice_items (
            id, invoice_id, product_id, product_name, unit, quantity, unit_price,
            purchase_price_snapshot, discount_amount, total_amount
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            invoice_id = excluded.invoice_id,
            product_id = excluded.product_id,
            product_name = excluded.product_name,
            unit = excluded.unit,
            quantity = excluded.quantity,
            unit_price = excluded.unit_price,
            purchase_price_snapshot = excluded.purchase_price_snapshot,
            discount_amount = excluded.discount_amount,
            total_amount = excluded.total_amount`,
          [
            Number(it.id),
            Number(it.invoice_id),
            prodId,
            it.product_name || 'کالا',
            it.unit || 'عدد',
            Number(it.quantity ?? 1),
            Math.round(Number(it.unit_price ?? 0)),
            Math.round(Number(it.purchase_price_snapshot ?? 0)),
            Math.round(Number(it.discount_amount ?? 0)),
            Math.round(Number(it.total_amount ?? 0))
          ]
        );
      }
    }

    // 6. payments
    if (Array.isArray(dump.payments)) {
      for (const p of dump.payments) {
        if (!p || !p.id) continue;
        const custId =
          p.customer_id && validCustomerIds.has(Number(p.customer_id)) ? Number(p.customer_id) : 1;
        await tx.execute(
          `INSERT INTO payments (
            id, customer_id, amount, payment_date, payment_method, tracking_code,
            notes, idempotency_key, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))
          ON CONFLICT(id) DO UPDATE SET
            customer_id = excluded.customer_id,
            amount = excluded.amount,
            payment_date = excluded.payment_date,
            payment_method = excluded.payment_method,
            tracking_code = excluded.tracking_code,
            notes = excluded.notes,
            status = excluded.status,
            updated_at = CURRENT_TIMESTAMP`,
          [
            Number(p.id),
            custId,
            Math.round(Number(p.amount ?? 0)),
            p.payment_date,
            p.payment_method || 'cash',
            p.tracking_code ?? '',
            p.notes ?? '',
            p.idempotency_key ?? null,
            p.status || 'valid',
            p.created_at || null,
            p.updated_at || null
          ]
        );
      }
    }

    const paymentRows = await tx.queryAll<{ id: number }>('SELECT id FROM payments');
    const validPaymentIds = new Set(paymentRows.map((r) => Number(r.id)));

    // 7. payment_allocations
    if (Array.isArray(dump.payment_allocations)) {
      for (const pa of dump.payment_allocations) {
        if (
          !pa ||
          !pa.id ||
          !validPaymentIds.has(Number(pa.payment_id)) ||
          !validInvoiceIds.has(Number(pa.invoice_id))
        ) {
          continue;
        }
        await tx.execute(
          `INSERT INTO payment_allocations (id, payment_id, invoice_id, amount, created_at)
           VALUES (?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
           ON CONFLICT(id) DO UPDATE SET
             payment_id = excluded.payment_id,
             invoice_id = excluded.invoice_id,
             amount = excluded.amount`,
          [
            Number(pa.id),
            Number(pa.payment_id),
            Number(pa.invoice_id),
            Math.round(Number(pa.amount ?? 0)),
            pa.created_at || null
          ]
        );
      }
    }

    // 8. customer_credits
    if (Array.isArray(dump.customer_credits)) {
      for (const cc of dump.customer_credits) {
        if (!cc || !cc.id) continue;
        const custId =
          cc.customer_id && validCustomerIds.has(Number(cc.customer_id)) ? Number(cc.customer_id) : 1;
        const payId =
          cc.payment_id && validPaymentIds.has(Number(cc.payment_id)) ? Number(cc.payment_id) : null;
        await tx.execute(
          `INSERT INTO customer_credits (id, customer_id, payment_id, amount, used_amount, remaining_credit, created_at)
           VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
           ON CONFLICT(id) DO UPDATE SET
             customer_id = excluded.customer_id,
             payment_id = excluded.payment_id,
             amount = excluded.amount,
             used_amount = excluded.used_amount,
             remaining_credit = excluded.remaining_credit`,
          [
            Number(cc.id),
            custId,
            payId,
            Math.round(Number(cc.amount ?? 0)),
            Math.round(Number(cc.used_amount ?? 0)),
            Math.round(Number(cc.remaining_credit ?? 0)),
            cc.created_at || null
          ]
        );
      }
    }

    // 9. expenses
    if (Array.isArray(dump.expenses)) {
      for (const e of dump.expenses) {
        if (!e || !e.id || !e.title) continue;
        await tx.execute(
          `INSERT INTO expenses (id, title, category, amount, expense_date, payment_method, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
           ON CONFLICT(id) DO UPDATE SET
             title = excluded.title,
             category = excluded.category,
             amount = excluded.amount,
             expense_date = excluded.expense_date,
             payment_method = excluded.payment_method,
             notes = excluded.notes`,
          [
            Number(e.id),
            e.title,
            e.category || 'عمومی',
            Math.round(Number(e.amount ?? 0)),
            e.expense_date,
            e.payment_method || 'cash',
            e.notes ?? null,
            e.created_at || null
          ]
        );
      }
    }

    // 10. financial_adjustments
    if (Array.isArray(dump.financial_adjustments)) {
      for (const fa of dump.financial_adjustments) {
        if (!fa || !fa.id) continue;
        await tx.execute(
          `INSERT INTO financial_adjustments (id, entity_type, entity_id, adjustment_type, amount, reason, created_at)
           VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
           ON CONFLICT(id) DO UPDATE SET
             entity_type = excluded.entity_type,
             entity_id = excluded.entity_id,
             adjustment_type = excluded.adjustment_type,
             amount = excluded.amount,
             reason = excluded.reason`,
          [
            Number(fa.id),
            fa.entity_type,
            Number(fa.entity_id ?? 0),
            fa.adjustment_type,
            Math.round(Number(fa.amount ?? 0)),
            fa.reason || '',
            fa.created_at || null
          ]
        );
      }
    }

    // 11. audit_logs
    if (Array.isArray(dump.audit_logs)) {
      for (const al of dump.audit_logs) {
        if (!al || !al.id) continue;
        await tx.execute(
          `INSERT INTO audit_logs (id, action, entity_type, entity_id, details, created_at)
           VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
           ON CONFLICT(id) DO NOTHING`,
          [
            Number(al.id),
            al.action,
            al.entity_type,
            al.entity_id !== undefined && al.entity_id !== null ? Number(al.entity_id) : null,
            al.details ?? null,
            al.created_at || null
          ]
        );
      }
    }

    await reconcileAllFinancials(tx);
    return exportFullSnapshot(tx);
  });
}
