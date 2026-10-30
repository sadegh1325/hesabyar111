import { Document, Paragraph, Table, TableRow, TableCell, TextRun, HeadingLevel, WidthType, AlignmentType, BorderStyle, Packer } from 'docx';
import { db } from './db.js';
import { getCustomerFinancialSummary } from './finance.js';
import { getTodayJalali, formatToman } from '../lib/dateUtils.js';

export async function generateCustomerWordReport(customerId: number): Promise<Buffer> {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId) as any;
  if (!customer) {
    throw new Error('مشتری یافت نشد.');
  }

  const settingsRows = db.prepare('SELECT key, value FROM app_settings').all() as any[];
  const settings: Record<string, string> = {};
  for (const s of settingsRows) {
    settings[s.key] = s.value;
  }
  const storeName = settings['store_name'] || 'فروشگاه';

  const summary = getCustomerFinancialSummary(customerId);
  const todayJalali = getTodayJalali();

  // Invoices of this customer
  const invoices = db.prepare(`
    SELECT * FROM invoices 
    WHERE customer_id = ? AND status != 'cancelled'
    ORDER BY id ASC
  `).all(customerId) as any[];

  // Payments of this customer
  const payments = db.prepare(`
    SELECT * FROM payments 
    WHERE customer_id = ? AND status = 'valid'
    ORDER BY id ASC
  `).all(customerId) as any[];

  // Create table rows for invoices
  const invoiceTableRows = [
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'شماره فاکتور', bold: true })], alignment: AlignmentType.CENTER })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'تاریخ', bold: true })], alignment: AlignmentType.CENTER })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'مبلغ کل (تومان)', bold: true })], alignment: AlignmentType.CENTER })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'پرداخت شده', bold: true })], alignment: AlignmentType.CENTER })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'مانده بدهی', bold: true })], alignment: AlignmentType.CENTER })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'وضعیت', bold: true })], alignment: AlignmentType.CENTER })] }),
      ]
    })
  ];

  for (const inv of invoices) {
    const statusFa = inv.status === 'paid' ? 'تسویه شده' : inv.status === 'partially_paid' ? 'پرداخت جزئی' : 'پرداخت نشده';
    invoiceTableRows.push(
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun(inv.invoice_number)], alignment: AlignmentType.CENTER })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun(inv.issue_date)], alignment: AlignmentType.CENTER })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun(inv.final_total.toLocaleString('fa-IR'))], alignment: AlignmentType.CENTER })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun(inv.paid_amount.toLocaleString('fa-IR'))], alignment: AlignmentType.CENTER })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun(inv.remaining_amount.toLocaleString('fa-IR'))], alignment: AlignmentType.CENTER })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun(statusFa)], alignment: AlignmentType.CENTER })] }),
        ]
      })
    );
  }

  // Create table rows for payments
  const paymentTableRows = [
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'ردیف', bold: true })], alignment: AlignmentType.CENTER })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'تاریخ پرداخت', bold: true })], alignment: AlignmentType.CENTER })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'مبلغ پرداختی (تومان)', bold: true })], alignment: AlignmentType.CENTER })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'روش پرداخت', bold: true })], alignment: AlignmentType.CENTER })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'کد پیگیری / توضیحات', bold: true })], alignment: AlignmentType.CENTER })] }),
      ]
    })
  ];

  let pIndex = 1;
  for (const pay of payments) {
    const methodFa: Record<string, string> = {
      cash: 'نقدی',
      pos: 'کارتخوان',
      bank_transfer: 'واریز بانکی / کارت به کارت',
      other: 'سایر'
    };
    paymentTableRows.push(
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun(pIndex.toString())], alignment: AlignmentType.CENTER })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun(pay.payment_date)], alignment: AlignmentType.CENTER })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun(pay.amount.toLocaleString('fa-IR'))], alignment: AlignmentType.CENTER })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun(methodFa[pay.payment_method] || pay.payment_method)], alignment: AlignmentType.CENTER })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun(pay.tracking_code || pay.notes || '-')], alignment: AlignmentType.CENTER })] }),
        ]
      })
    );
    pIndex++;
  }

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: storeName,
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: `صورت‌حساب مالی و گردش حساب مشتری: ${customer.name}`,
            heading: HeadingLevel.HEADING_2,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `تاریخ گزارش: ${todayJalali}   |   تلفن تماس: ${customer.phone || 'ثبت نشده'}   |   نشانی: ${customer.address || '-'}`, color: '555555' }),
            ],
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [
              new TextRun({ text: '■ خلاصه وضعیت مالی مشتری:', bold: true }),
            ],
            alignment: AlignmentType.RIGHT,
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `• جمع کل خریدهای ثبت شده: ${formatToman(summary.totalInvoiced)}\n` }),
              new TextRun({ text: `• جمع کل مبالغ پرداخت شده: ${formatToman(summary.totalPaid)}\n` }),
              new TextRun({ 
                text: summary.netBalance > 0 
                  ? `• مانده بدهی فعلی: ${formatToman(summary.netBalance)} (بدهکار)`
                  : summary.netBalance < 0
                  ? `• مانده اعتبار مشتری: ${formatToman(Math.abs(summary.netBalance))} (بستانکار)`
                  : '• وضعیت حساب: تسویه کامل بدون بدهی',
                bold: true,
                color: summary.netBalance > 0 ? 'DC2626' : '16A34A'
              }),
            ],
            alignment: AlignmentType.RIGHT,
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [new TextRun({ text: 'فهرست فاکتورهای مشتری:', bold: true })],
            alignment: AlignmentType.RIGHT,
          }),
          new Table({
            rows: invoiceTableRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [new TextRun({ text: 'فهرست پرداخت‌های مشتری:', bold: true })],
            alignment: AlignmentType.RIGHT,
          }),
          new Table({
            rows: paymentTableRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [
              new TextRun({ text: 'این گزارش به صورت خودکار از سیستم حسابداری فروشگاه استخراج شده و به عنوان سند گردش حساب مشتری معتبر است.', italics: true, color: '666666' }),
            ],
            alignment: AlignmentType.CENTER,
          }),
        ],
      },
    ],
  });

  return await Packer.toBuffer(doc);
}
