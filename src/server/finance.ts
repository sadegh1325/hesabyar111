import { db } from './db.js';

export interface CustomerFinancialSummary {
  customerId: number;
  customerName: string;
  phone: string | null;
  totalInvoiced: number;
  totalPaid: number;
  totalOutstandingInvoices: number;
  totalUnallocatedCredit: number;
  netBalance: number; // Positive = owes money, Negative = in credit
  openInvoicesCount: number;
  lastPaymentDate: string | null;
  firstDebtDate: string | null;
}

/**
 * Recalculate and update the status and remaining amount for an invoice
 */
export function recalculateInvoice(invoiceId: number): {
  finalTotal: number;
  paidAmount: number;
  remainingAmount: number;
  status: string;
} {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
  if (!invoice) {
    throw new Error(`فاکتور با شناسه ${invoiceId} یافت نشد.`);
  }

  // Calculate sum of active allocations
  const allocRow = db.prepare(`
    SELECT COALESCE(SUM(pa.amount), 0) as total_allocated
    FROM payment_allocations pa
    JOIN payments p ON p.id = pa.payment_id
    WHERE pa.invoice_id = ? AND p.status = 'valid'
  `).get(invoiceId) as { total_allocated: number };

  const paidAmount = Math.max(0, allocRow.total_allocated);
  const remainingAmount = Math.max(0, invoice.final_total - paidAmount);

  let newStatus = invoice.status;
  if (invoice.status !== 'draft' && invoice.status !== 'cancelled') {
    if (paidAmount >= invoice.final_total && invoice.final_total > 0) {
      newStatus = 'paid';
    } else if (paidAmount > 0) {
      newStatus = 'partially_paid';
    } else {
      newStatus = 'unpaid';
    }
  }

  db.prepare(`
    UPDATE invoices
    SET paid_amount = ?, remaining_amount = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(paidAmount, remainingAmount, newStatus, invoiceId);

  return {
    finalTotal: invoice.final_total,
    paidAmount,
    remainingAmount,
    status: newStatus
  };
}

/**
 * Get comprehensive financial summary for a customer
 */
export function getCustomerFinancialSummary(customerId: number): CustomerFinancialSummary {
  const customer = db.prepare('SELECT id, name, phone FROM customers WHERE id = ?').get(customerId) as any;
  if (!customer) {
    throw new Error('مشتری یافت نشد.');
  }

  // Sum of valid non-cancelled invoices
  const invRow = db.prepare(`
    SELECT 
      COALESCE(SUM(final_total), 0) as total_invoiced,
      COALESCE(SUM(paid_amount), 0) as total_paid_invoices,
      COALESCE(SUM(remaining_amount), 0) as total_outstanding,
      COUNT(CASE WHEN remaining_amount > 0 AND status != 'cancelled' AND status != 'draft' THEN 1 END) as open_count,
      MIN(CASE WHEN remaining_amount > 0 AND status != 'cancelled' AND status != 'draft' THEN issue_date END) as first_debt_date
    FROM invoices
    WHERE customer_id = ? AND status != 'cancelled' AND status != 'draft'
  `).get(customerId) as any;

  // Total valid payments made by customer
  const payRow = db.prepare(`
    SELECT 
      COALESCE(SUM(amount), 0) as total_paid,
      MAX(payment_date) as last_payment_date
    FROM payments
    WHERE customer_id = ? AND status = 'valid'
  `).get(customerId) as any;

  // Unallocated available credits
  const creditRow = db.prepare(`
    SELECT COALESCE(SUM(remaining_credit), 0) as total_credit
    FROM customer_credits
    WHERE customer_id = ? AND remaining_credit > 0
  `).get(customerId) as any;

  const totalOutstanding = invRow.total_outstanding || 0;
  const unallocatedCredit = creditRow.total_credit || 0;
  // Net balance: positive means customer owes store; negative means store owes customer
  const netBalance = Math.round(totalOutstanding - unallocatedCredit);

  return {
    customerId: customer.id,
    customerName: customer.name,
    phone: customer.phone,
    totalInvoiced: invRow.total_invoiced || 0,
    totalPaid: payRow.total_paid || 0,
    totalOutstandingInvoices: totalOutstanding,
    totalUnallocatedCredit: unallocatedCredit,
    netBalance,
    openInvoicesCount: invRow.open_count || 0,
    lastPaymentDate: payRow.last_payment_date || null,
    firstDebtDate: invRow.first_debt_date || null
  };
}

/**
 * Record a payment atomically with allocations and/or credit
 */
export function recordPayment(params: {
  customerId: number;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  trackingCode?: string;
  notes?: string;
  idempotencyKey?: string;
  allocations?: Array<{ invoiceId: number; amount: number }>;
  allowOverpaymentToCredit?: boolean;
}): {
  paymentId: number;
  allocatedTotal: number;
  creditAdded: number;
} {
  const {
    customerId,
    amount,
    paymentDate,
    paymentMethod,
    trackingCode,
    notes,
    idempotencyKey,
    allocations = [],
    allowOverpaymentToCredit = true
  } = params;

  if (amount <= 0) {
    throw new Error('مبلغ پرداخت باید بزرگتر از صفر باشد.');
  }

  // Atomic transaction
  const execute = db.transaction(() => {
    // Check idempotency if key provided
    if (idempotencyKey) {
      const existing = db.prepare('SELECT id FROM payments WHERE idempotency_key = ?').get(idempotencyKey) as any;
      if (existing) {
        throw new Error('این تراکنش قبلاً با این کلید یکتا ثبت شده است.');
      }
    }

    // Insert payment
    const insertPayment = db.prepare(`
      INSERT INTO payments (customer_id, amount, payment_date, payment_method, tracking_code, notes, idempotency_key, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'valid')
    `);
    const result = insertPayment.run(
      customerId,
      Math.round(amount),
      paymentDate,
      paymentMethod,
      trackingCode || '',
      notes || '',
      idempotencyKey || null
    );
    const paymentId = Number(result.lastInsertRowid);

    let allocatedTotal = 0;
    const touchedInvoices = new Set<number>();

    // Allocate to specified invoices
    for (const alloc of allocations) {
      if (alloc.amount <= 0) continue;
      const inv = db.prepare('SELECT id, customer_id, final_total, paid_amount, remaining_amount FROM invoices WHERE id = ?').get(alloc.invoiceId) as any;
      if (!inv) {
        throw new Error(`فاکتور ${alloc.invoiceId} یافت نشد.`);
      }
      if (inv.customer_id !== customerId) {
        throw new Error(`فاکتور ${alloc.invoiceId} متعلق به این مشتری نیست.`);
      }

      const allocAmount = Math.round(alloc.amount);
      if (allocatedTotal + allocAmount > amount) {
        throw new Error('مجموع مبالغ تخصیص یافته از کل مبلغ دریافتی بیشتر است.');
      }

      db.prepare(`
        INSERT INTO payment_allocations (payment_id, invoice_id, amount)
        VALUES (?, ?, ?)
      `).run(paymentId, alloc.invoiceId, allocAmount);

      allocatedTotal += allocAmount;
      touchedInvoices.add(alloc.invoiceId);
    }

    // Check remainder
    const remainder = Math.round(amount - allocatedTotal);
    let creditAdded = 0;
    if (remainder > 0) {
      if (!allowOverpaymentToCredit) {
        throw new Error(`مبلغ ${remainder.toLocaleString('fa-IR')} تومان مازاد تخصیص داده نشده است.`);
      }
      // Store remainder as customer unallocated credit
      db.prepare(`
        INSERT INTO customer_credits (customer_id, payment_id, amount, used_amount, remaining_credit)
        VALUES (?, ?, ?, 0, ?)
      `).run(customerId, paymentId, remainder, remainder);
      creditAdded = remainder;
    }

    // Recalculate touched invoices
    for (const invId of touchedInvoices) {
      recalculateInvoice(invId);
    }

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (action, entity_type, entity_id, details)
      VALUES ('record_payment', 'payment', ?, ?)
    `).run(paymentId, JSON.stringify({ customerId, amount, allocatedTotal, creditAdded, paymentMethod }));

    return {
      paymentId,
      allocatedTotal,
      creditAdded
    };
  });

  return execute();
}

/**
 * Apply available customer credit to an unpaid invoice
 */
export function applyCustomerCredit(customerId: number, invoiceId: number, amountToApply: number) {
  const execute = db.transaction(() => {
    const inv = db.prepare('SELECT id, customer_id, remaining_amount FROM invoices WHERE id = ?').get(invoiceId) as any;
    if (!inv || inv.customer_id !== customerId) {
      throw new Error('فاکتور معتبر نیست یا متعلق به این مشتری نمی‌باشد.');
    }

    const availableCredits = db.prepare(`
      SELECT id, remaining_credit, payment_id
      FROM customer_credits
      WHERE customer_id = ? AND remaining_credit > 0
      ORDER BY id ASC
    `).all(customerId) as Array<{ id: number; remaining_credit: number; payment_id: number | null }>;

    const totalAvailable = availableCredits.reduce((sum, c) => sum + c.remaining_credit, 0);
    const amount = Math.min(amountToApply, inv.remaining_amount, totalAvailable);
    if (amount <= 0) {
      throw new Error('اعتبار کافی یا مانده بدهی برای تخصیص وجود ندارد.');
    }

    let needed = amount;
    for (const credit of availableCredits) {
      if (needed <= 0) break;
      const take = Math.min(credit.remaining_credit, needed);

      db.prepare(`
        UPDATE customer_credits
        SET used_amount = used_amount + ?, remaining_credit = remaining_credit - ?
        WHERE id = ?
      `).run(take, take, credit.id);

      // Create allocation or associate with the payment
      if (credit.payment_id) {
        db.prepare(`
          INSERT INTO payment_allocations (payment_id, invoice_id, amount)
          VALUES (?, ?, ?)
        `).run(credit.payment_id, invoiceId, take);
      } else {
        // If credit has no direct payment (e.g. manual adjustment), create a virtual payment allocation or record
        const paymentRes = db.prepare(`
          INSERT INTO payments (customer_id, amount, payment_date, payment_method, notes, status)
          VALUES (?, ?, DATE('now'), 'credit', 'تخصیص اعتبار پیشین مشتری', 'valid')
        `).run(customerId, take);
        db.prepare(`
          INSERT INTO payment_allocations (payment_id, invoice_id, amount)
          VALUES (?, ?, ?)
        `).run(paymentRes.lastInsertRowid, invoiceId, take);
      }

      needed -= take;
    }

    recalculateInvoice(invoiceId);

    db.prepare(`
      INSERT INTO audit_logs (action, entity_type, entity_id, details)
      VALUES ('apply_credit', 'invoice', ?, ?)
    `).run(invoiceId, JSON.stringify({ customerId, amountApplied: amount }));

    return { appliedAmount: amount };
  });

  return execute();
}

/**
 * Void/Refund a payment safely with audit trail
 */
export function refundOrVoidPayment(paymentId: number, reason: string): { success: boolean } {
  const execute = db.transaction(() => {
    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId) as any;
    if (!payment) {
      throw new Error('پرداخت مورد نظر یافت نشد.');
    }
    if (payment.status !== 'valid') {
      throw new Error('این پرداخت قبلاً لغو یا برگشت خورده است.');
    }

    // Get allocations to update invoices
    const allocations = db.prepare('SELECT invoice_id FROM payment_allocations WHERE payment_id = ?').all(paymentId) as any[];

    // Mark payment status as refunded
    db.prepare(`UPDATE payments SET status = 'refunded', notes = notes || ' [برگشت: ' || ? || ']' WHERE id = ?`).run(reason, paymentId);

    // Cancel any unallocated credits generated by this payment
    db.prepare(`UPDATE customer_credits SET remaining_credit = 0 WHERE payment_id = ?`).run(paymentId);

    // Remove or nullify allocations
    db.prepare('DELETE FROM payment_allocations WHERE payment_id = ?').run(paymentId);

    // Recalculate affected invoices
    for (const alloc of allocations) {
      recalculateInvoice(alloc.invoice_id);
    }

    // Record adjustment
    db.prepare(`
      INSERT INTO financial_adjustments (entity_type, entity_id, adjustment_type, amount, reason)
      VALUES ('payment', ?, 'refund', ?, ?)
    `).run(paymentId, payment.amount, reason);

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (action, entity_type, entity_id, details)
      VALUES ('refund_payment', 'payment', ?, ?)
    `).run(paymentId, JSON.stringify({ amount: payment.amount, reason }));

    return { success: true };
  });

  return execute();
}
