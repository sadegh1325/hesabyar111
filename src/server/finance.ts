import {
  DbSession,
  dbQueryGet,
  dbQueryAll,
  dbExecute,
  runTransaction,
  bumpDbRevision
} from './db.js';

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
export async function recalculateInvoice(
  invoiceId: number,
  tx?: DbSession
): Promise<{
  finalTotal: number;
  paidAmount: number;
  remainingAmount: number;
  status: string;
}> {
  const invoice = await dbQueryGet<any>('SELECT * FROM invoices WHERE id = ?', [invoiceId], tx);
  if (!invoice) {
    throw new Error(`فاکتور با شناسه ${invoiceId} یافت نشد.`);
  }

  const allocRow = await dbQueryGet<{ total_allocated: number }>(
    `SELECT COALESCE(SUM(pa.amount), 0) as total_allocated
     FROM payment_allocations pa
     JOIN payments p ON p.id = pa.payment_id
     WHERE pa.invoice_id = ? AND p.status = 'valid'`,
    [invoiceId],
    tx
  );

  const paidAmount = Math.max(0, Number(allocRow?.total_allocated || 0));
  const finalTotal = Math.max(0, Number(invoice.final_total || 0));
  const remainingAmount = Math.max(0, finalTotal - paidAmount);

  let newStatus = invoice.status;
  if (invoice.status !== 'draft' && invoice.status !== 'cancelled') {
    if (paidAmount >= finalTotal && finalTotal > 0) {
      newStatus = 'paid';
    } else if (paidAmount > 0) {
      newStatus = 'partially_paid';
    } else if (finalTotal === 0) {
      newStatus = 'paid';
    } else {
      newStatus = 'unpaid';
    }
  }

  await dbExecute(
    `UPDATE invoices
     SET paid_amount = ?, remaining_amount = ?, status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [paidAmount, remainingAmount, newStatus, invoiceId],
    tx
  );

  return {
    finalTotal,
    paidAmount,
    remainingAmount,
    status: newStatus
  };
}

/**
 * Get comprehensive financial summary for a customer
 */
export async function getCustomerFinancialSummary(
  customerId: number,
  tx?: DbSession
): Promise<CustomerFinancialSummary> {
  const customer = await dbQueryGet<any>(
    'SELECT id, name, phone FROM customers WHERE id = ?',
    [customerId],
    tx
  );
  if (!customer) {
    throw new Error('مشتری یافت نشد.');
  }

  const invRow = await dbQueryGet<any>(
    `SELECT
      COALESCE(SUM(final_total), 0) as total_invoiced,
      COALESCE(SUM(paid_amount), 0) as total_paid_invoices,
      COALESCE(SUM(remaining_amount), 0) as total_outstanding,
      COUNT(CASE WHEN remaining_amount > 0 AND status != 'cancelled' AND status != 'draft' THEN 1 END) as open_count,
      MIN(CASE WHEN remaining_amount > 0 AND status != 'cancelled' AND status != 'draft' THEN issue_date END) as first_debt_date
     FROM invoices
     WHERE customer_id = ? AND status != 'cancelled' AND status != 'draft'`,
    [customerId],
    tx
  );

  const payRow = await dbQueryGet<any>(
    `SELECT
      COALESCE(SUM(amount), 0) as total_paid,
      MAX(payment_date) as last_payment_date
     FROM payments
     WHERE customer_id = ? AND status = 'valid'`,
    [customerId],
    tx
  );

  const creditRow = await dbQueryGet<any>(
    `SELECT COALESCE(SUM(remaining_credit), 0) as total_credit
     FROM customer_credits
     WHERE customer_id = ? AND remaining_credit > 0`,
    [customerId],
    tx
  );

  const totalOutstanding = Number(invRow?.total_outstanding || 0);
  const unallocatedCredit = Number(creditRow?.total_credit || 0);
  const netBalance = Math.round(totalOutstanding - unallocatedCredit);

  return {
    customerId: Number(customer.id),
    customerName: customer.name,
    phone: customer.phone || null,
    totalInvoiced: Number(invRow?.total_invoiced || 0),
    totalPaid: Number(payRow?.total_paid || 0),
    totalOutstandingInvoices: totalOutstanding,
    totalUnallocatedCredit: unallocatedCredit,
    netBalance,
    openInvoicesCount: Number(invRow?.open_count || 0),
    lastPaymentDate: payRow?.last_payment_date || null,
    firstDebtDate: invRow?.first_debt_date || null
  };
}

/**
 * Record a payment atomically with allocations and/or credit
 */
export async function recordPayment(
  params: {
    customerId: number;
    amount: number;
    paymentDate: string;
    paymentMethod: string;
    trackingCode?: string;
    notes?: string;
    idempotencyKey?: string;
    allocations?: Array<{ invoiceId: number; amount: number }>;
    allowOverpaymentToCredit?: boolean;
  },
  outerTx?: DbSession
): Promise<{
  paymentId: number;
  allocatedTotal: number;
  creditAdded: number;
}> {
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

  const executeBody = async (tx: DbSession) => {
    const customerExists = await dbQueryGet<{ id: number }>(
      'SELECT id FROM customers WHERE id = ?',
      [customerId],
      tx
    );
    if (!customerExists) {
      throw new Error(`مشتری با شناسه ${customerId} در پایگاه داده یافت نشد.`);
    }

    if (idempotencyKey) {
      const existing = await dbQueryGet<{ id: number }>(
        'SELECT id FROM payments WHERE idempotency_key = ?',
        [idempotencyKey],
        tx
      );
      if (existing) {
        throw new Error('این تراکنش قبلاً با این کلید یکتا ثبت شده است.');
      }
    }

    const result = await dbExecute(
      `INSERT INTO payments (customer_id, amount, payment_date, payment_method, tracking_code, notes, idempotency_key, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'valid')`,
      [
        customerId,
        Math.round(amount),
        paymentDate,
        paymentMethod,
        trackingCode || '',
        notes || '',
        idempotencyKey || null
      ],
      tx
    );
    const paymentId = result.lastInsertRowid;

    let allocatedTotal = 0;
    const touchedInvoices = new Set<number>();

    for (const alloc of allocations) {
      if (!alloc || alloc.amount <= 0) continue;
      const inv = await dbQueryGet<any>(
        'SELECT id, customer_id, final_total, paid_amount, remaining_amount FROM invoices WHERE id = ?',
        [alloc.invoiceId],
        tx
      );
      if (!inv) {
        throw new Error(`فاکتور ${alloc.invoiceId} یافت نشد.`);
      }
      if (Number(inv.customer_id) !== Number(customerId)) {
        throw new Error(`فاکتور ${alloc.invoiceId} متعلق به این مشتری نیست.`);
      }

      const allocAmount = Math.round(alloc.amount);
      if (allocatedTotal + allocAmount > Math.round(amount)) {
        throw new Error('مجموع مبالغ تخصیص یافته از کل مبلغ دریافتی بیشتر است.');
      }

      await dbExecute(
        `INSERT INTO payment_allocations (payment_id, invoice_id, amount)
         VALUES (?, ?, ?)`,
        [paymentId, alloc.invoiceId, allocAmount],
        tx
      );

      allocatedTotal += allocAmount;
      touchedInvoices.add(alloc.invoiceId);
    }

    const remainder = Math.round(amount - allocatedTotal);
    let creditAdded = 0;
    if (remainder > 0) {
      if (!allowOverpaymentToCredit) {
        throw new Error(`مبلغ ${remainder.toLocaleString('fa-IR')} تومان مازاد تخصیص داده نشده است.`);
      }
      await dbExecute(
        `INSERT INTO customer_credits (customer_id, payment_id, amount, used_amount, remaining_credit)
         VALUES (?, ?, ?, 0, ?)`,
        [customerId, paymentId, remainder, remainder],
        tx
      );
      creditAdded = remainder;
    }

    for (const invId of touchedInvoices) {
      await recalculateInvoice(invId, tx);
    }

    await dbExecute(
      `INSERT INTO audit_logs (action, entity_type, entity_id, details)
       VALUES ('record_payment', 'payment', ?, ?)`,
      [paymentId, JSON.stringify({ customerId, amount, allocatedTotal, creditAdded, paymentMethod })],
      tx
    );

    await bumpDbRevision(tx);

    return {
      paymentId,
      allocatedTotal,
      creditAdded
    };
  };

  if (outerTx) {
    return executeBody(outerTx);
  }
  return runTransaction(executeBody);
}

/**
 * Apply available customer credit to an unpaid invoice
 */
export async function applyCustomerCredit(
  customerId: number,
  invoiceId: number,
  amountToApply: number,
  outerTx?: DbSession
): Promise<{ appliedAmount: number }> {
  const executeBody = async (tx: DbSession) => {
    const inv = await dbQueryGet<any>(
      'SELECT id, customer_id, remaining_amount FROM invoices WHERE id = ?',
      [invoiceId],
      tx
    );
    if (!inv || Number(inv.customer_id) !== Number(customerId)) {
      throw new Error('فاکتور معتبر نیست یا متعلق به این مشتری نمی‌باشد.');
    }

    const availableCredits = await dbQueryAll<{
      id: number;
      remaining_credit: number;
      payment_id: number | null;
    }>(
      `SELECT id, remaining_credit, payment_id
       FROM customer_credits
       WHERE customer_id = ? AND remaining_credit > 0
       ORDER BY id ASC`,
      [customerId],
      tx
    );

    const totalAvailable = availableCredits.reduce((sum, c) => sum + Number(c.remaining_credit), 0);
    const amount = Math.min(amountToApply, Number(inv.remaining_amount), totalAvailable);
    if (amount <= 0) {
      throw new Error('اعتبار کافی یا مانده بدهی برای تخصیص وجود ندارد.');
    }

    let needed = amount;
    for (const credit of availableCredits) {
      if (needed <= 0) break;
      const take = Math.min(Number(credit.remaining_credit), needed);

      await dbExecute(
        `UPDATE customer_credits
         SET used_amount = used_amount + ?, remaining_credit = remaining_credit - ?
         WHERE id = ?`,
        [take, take, credit.id],
        tx
      );

      if (credit.payment_id) {
        await dbExecute(
          `INSERT INTO payment_allocations (payment_id, invoice_id, amount)
           VALUES (?, ?, ?)`,
          [credit.payment_id, invoiceId, take],
          tx
        );
      } else {
        const paymentRes = await dbExecute(
          `INSERT INTO payments (customer_id, amount, payment_date, payment_method, notes, status)
           VALUES (?, ?, DATE('now'), 'credit', 'تخصیص اعتبار پیشین مشتری', 'valid')`,
          [customerId, take],
          tx
        );
        await dbExecute(
          `INSERT INTO payment_allocations (payment_id, invoice_id, amount)
           VALUES (?, ?, ?)`,
          [paymentRes.lastInsertRowid, invoiceId, take],
          tx
        );
      }

      needed -= take;
    }

    await recalculateInvoice(invoiceId, tx);

    await dbExecute(
      `INSERT INTO audit_logs (action, entity_type, entity_id, details)
       VALUES ('apply_credit', 'invoice', ?, ?)`,
      [invoiceId, JSON.stringify({ customerId, amountApplied: amount })],
      tx
    );

    await bumpDbRevision(tx);

    return { appliedAmount: amount };
  };

  if (outerTx) {
    return executeBody(outerTx);
  }
  return runTransaction(executeBody);
}

/**
 * Void/Refund a payment safely with audit trail
 */
export async function refundOrVoidPayment(
  paymentId: number,
  reason: string,
  outerTx?: DbSession
): Promise<{ success: boolean }> {
  const executeBody = async (tx: DbSession) => {
    const payment = await dbQueryGet<any>('SELECT * FROM payments WHERE id = ?', [paymentId], tx);
    if (!payment) {
      throw new Error('پرداخت مورد نظر یافت نشد.');
    }
    if (payment.status !== 'valid') {
      throw new Error('این پرداخت قبلاً لغو یا برگشت خورده است.');
    }

    const allocations = await dbQueryAll<{ invoice_id: number }>(
      'SELECT invoice_id FROM payment_allocations WHERE payment_id = ?',
      [paymentId],
      tx
    );

    await dbExecute(
      `UPDATE payments
       SET status = 'refunded',
           notes = COALESCE(notes, '') || ' [برگشت: ' || ? || ']',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [reason, paymentId],
      tx
    );

    await dbExecute(
      'UPDATE customer_credits SET remaining_credit = 0 WHERE payment_id = ?',
      [paymentId],
      tx
    );

    await dbExecute('DELETE FROM payment_allocations WHERE payment_id = ?', [paymentId], tx);

    for (const alloc of allocations) {
      await recalculateInvoice(alloc.invoice_id, tx);
    }

    await dbExecute(
      `INSERT INTO financial_adjustments (entity_type, entity_id, adjustment_type, amount, reason)
       VALUES ('payment', ?, 'refund', ?, ?)`,
      [paymentId, payment.amount, reason],
      tx
    );

    await dbExecute(
      `INSERT INTO audit_logs (action, entity_type, entity_id, details)
       VALUES ('refund_payment', 'payment', ?, ?)`,
      [paymentId, JSON.stringify({ amount: payment.amount, reason })],
      tx
    );

    await bumpDbRevision(tx);

    return { success: true };
  };

  if (outerTx) {
    return executeBody(outerTx);
  }
  return runTransaction(executeBody);
}
