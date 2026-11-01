import PDFDocument from 'pdfkit';
import { db } from './db.js';
import { getCustomerFinancialSummary } from './finance.js';
import { getTodayJalali, formatToman } from '../lib/dateUtils.js';
import fs from 'fs';
// @ts-ignore
import reshaperPkg from 'arabic-persian-reshaper';

const PersianShaper = reshaperPkg.PersianShaper || reshaperPkg;

function shapeText(text: string | number | null | undefined): string {
  if (text === null || text === undefined || text === '') return '-';
  const str = String(text);
  try {
    const shaped = PersianShaper.convertArabic(str);
    // Reverse word order for RTL rendering in standard left-to-right PDF text streams
    return shaped.split(' ').reverse().join(' ');
  } catch {
    return str;
  }
}

export async function generateCustomerPdfReport(customerId: number): Promise<Buffer> {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId) as any;
  if (!customer) {
    throw new Error('مشتری یافت نشد.');
  }

  const settingsRows = db.prepare('SELECT key, value FROM app_settings').all() as any[];
  const settings: Record<string, string> = {};
  for (const s of settingsRows) {
    settings[s.key] = s.value;
  }
  const storeName = settings['store_name'] || 'فروشگاه حاج کریم و پسران';

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

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 36,
        info: {
          Title: `صورتحساب_${customer.name}`,
          Author: storeName,
          Subject: `صورتحساب و گردش حساب مالی مشتری ${customer.name}`,
          CreationDate: new Date(),
        }
      });

      const fontPath = fs.existsSync('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
        ? '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
        : 'Helvetica';
      const fontBoldPath = fs.existsSync('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')
        ? '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
        : fontPath;

      const buffers: Buffer[] = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const pageWidth = doc.page.width; // 595.28
      const margin = 36;
      const contentWidth = pageWidth - (margin * 2); // ~523

      // Top Decorative Header Box
      doc.rect(margin, margin, contentWidth, 54).fillAndStroke('#0f172a', '#0f172a');
      doc.fillColor('#ffffff').font(fontBoldPath).fontSize(14);
      doc.text(shapeText(storeName), margin, margin + 12, { width: contentWidth, align: 'center' });
      doc.fillColor('#94a3b8').font(fontPath).fontSize(9);
      doc.text(shapeText('صورت‌حساب مالی و گزارش جامع گردش حساب مشتری'), margin, margin + 32, { width: contentWidth, align: 'center' });

      let currentY = margin + 64;

      // Customer Info Bar
      doc.rect(margin, currentY, contentWidth, 32).fillAndStroke('#f8fafc', '#e2e8f0');
      doc.fillColor('#0f172a').font(fontBoldPath).fontSize(9);
      doc.text(shapeText(`نام و نام خانوادگی مشتری: ${customer.name}`), margin + 12, currentY + 10, { width: 300, align: 'right' });
      doc.font(fontPath).fontSize(8).fillColor('#64748b');
      doc.text(shapeText(`تاریخ صدور گزارش: ${todayJalali}`), margin + contentWidth - 200, currentY + 10, { width: 188, align: 'left' });

      currentY += 40;

      // KPI Summary Cards (3 cards)
      const cardWidth = (contentWidth - 16) / 3;

      // Card 1: Total Invoices
      doc.rect(margin, currentY, cardWidth, 42).fillAndStroke('#f8fafc', '#e2e8f0');
      doc.font(fontPath).fontSize(7.5).fillColor('#64748b');
      doc.text(shapeText('جمع کل خریدهای ثبت شده:'), margin + 8, currentY + 6, { width: cardWidth - 16, align: 'right' });
      doc.font(fontBoldPath).fontSize(9.5).fillColor('#0f172a');
      doc.text(shapeText(formatToman(summary.totalInvoiced)), margin + 8, currentY + 22, { width: cardWidth - 16, align: 'center' });

      // Card 2: Total Payments
      doc.rect(margin + cardWidth + 8, currentY, cardWidth, 42).fillAndStroke('#f0fdf4', '#bbf7d0');
      doc.font(fontPath).fontSize(7.5).fillColor('#15803d');
      doc.text(shapeText('جمع کل مبالغ پرداختی:'), margin + cardWidth + 16, currentY + 6, { width: cardWidth - 16, align: 'right' });
      doc.font(fontBoldPath).fontSize(9.5).fillColor('#15803d');
      doc.text(shapeText(formatToman(summary.totalPaid)), margin + cardWidth + 16, currentY + 22, { width: cardWidth - 16, align: 'center' });

      // Card 3: Net Balance
      const isDebtor = summary.netBalance > 0;
      const isCreditor = summary.netBalance < 0;
      const balanceBg = isDebtor ? '#fef2f2' : isCreditor ? '#f0fdf4' : '#f8fafc';
      const balanceBorder = isDebtor ? '#fecaca' : isCreditor ? '#bbf7d0' : '#e2e8f0';
      const balanceColor = isDebtor ? '#dc2626' : isCreditor ? '#15803d' : '#0f172a';
      const balanceLabel = isDebtor ? 'مانده بدهی مشتری (بدهکار):' : isCreditor ? 'مانده اعتبار مشتری (بستانکار):' : 'وضعیت نهایی حساب:';

      doc.rect(margin + (cardWidth * 2) + 16, currentY, cardWidth, 42).fillAndStroke(balanceBg, balanceBorder);
      doc.font(fontPath).fontSize(7.5).fillColor(balanceColor);
      doc.text(shapeText(balanceLabel), margin + (cardWidth * 2) + 24, currentY + 6, { width: cardWidth - 16, align: 'right' });
      doc.font(fontBoldPath).fontSize(9.5).fillColor(balanceColor);
      doc.text(shapeText(isDebtor || isCreditor ? formatToman(Math.abs(summary.netBalance)) : 'تسویه کامل'), margin + (cardWidth * 2) + 24, currentY + 22, { width: cardWidth - 16, align: 'center' });

      currentY += 52;

      // Invoices Section Header
      doc.font(fontBoldPath).fontSize(9).fillColor('#0f172a');
      doc.text(shapeText(`■ فهرست فاکتورهای مشتری (${invoices.length} فاکتور)`), margin, currentY, { width: contentWidth, align: 'right' });
      currentY += 16;

      // Invoices Table Header
      const colWidths = [60, 80, 80, 85, 90, 128]; // total 523
      const invoiceCols = ['وضعیت', 'مانده بدهی', 'پرداخت شده', 'مبلغ کل (تومان)', 'تاریخ صدور', 'شماره فاکتور'];

      doc.rect(margin, currentY, contentWidth, 20).fillAndStroke('#0f172a', '#0f172a');
      doc.fillColor('#ffffff').font(fontBoldPath).fontSize(7.5);

      let xOffset = margin;
      for (let i = 0; i < invoiceCols.length; i++) {
        doc.text(shapeText(invoiceCols[i]), xOffset + 4, currentY + 6, { width: colWidths[i] - 8, align: 'center' });
        xOffset += colWidths[i];
      }
      currentY += 20;

      // Invoices Rows
      if (invoices.length === 0) {
        doc.rect(margin, currentY, contentWidth, 22).fillAndStroke('#ffffff', '#e2e8f0');
        doc.font(fontPath).fontSize(8).fillColor('#94a3b8');
        doc.text(shapeText('هیچ فاکتوری برای این مشتری ثبت نشده است.'), margin, currentY + 6, { width: contentWidth, align: 'center' });
        currentY += 22;
      } else {
        let isAlt = false;
        for (const inv of invoices) {
          if (currentY > 740) {
            doc.addPage();
            currentY = margin;
          }

          const statusFa = inv.status === 'paid' ? 'تسویه شده' : inv.status === 'partially_paid' ? 'پرداخت جزئی' : 'پرداخت نشده';
          const rowBg = isAlt ? '#f8fafc' : '#ffffff';
          doc.rect(margin, currentY, contentWidth, 18).fillAndStroke(rowBg, '#e2e8f0');

          xOffset = margin;
          const rowData = [
            statusFa,
            formatToman(inv.remaining_amount),
            formatToman(inv.paid_amount),
            formatToman(inv.final_total),
            inv.issue_date,
            inv.invoice_number
          ];

          for (let i = 0; i < rowData.length; i++) {
            const isRemaining = i === 1 && inv.remaining_amount > 0;
            const isPaid = i === 2;
            doc.font(fontPath).fontSize(7.5).fillColor(isRemaining ? '#dc2626' : isPaid ? '#15803d' : '#334155');
            doc.text(shapeText(rowData[i]), xOffset + 4, currentY + 5, { width: colWidths[i] - 8, align: 'center' });
            xOffset += colWidths[i];
          }

          currentY += 18;
          isAlt = !isAlt;
        }
      }

      currentY += 16;

      // Payments Section Header
      if (currentY > 680) {
        doc.addPage();
        currentY = margin;
      }

      doc.font(fontBoldPath).fontSize(9).fillColor('#0f172a');
      doc.text(shapeText(`■ فهرست پرداخت‌ها و دریافتی‌ها (${payments.length} پرداخت)`), margin, currentY, { width: contentWidth, align: 'right' });
      currentY += 16;

      // Payments Table Header
      const payColWidths = [143, 90, 100, 110, 80]; // total 523
      const payCols = ['کد پیگیری / توضیحات', 'روش پرداخت', 'مبلغ پرداختی (تومان)', 'تاریخ پرداخت', 'شناسه پرداخت'];

      doc.rect(margin, currentY, contentWidth, 20).fillAndStroke('#1e293b', '#1e293b');
      doc.fillColor('#ffffff').font(fontBoldPath).fontSize(7.5);

      xOffset = margin;
      for (let i = 0; i < payCols.length; i++) {
        doc.text(shapeText(payCols[i]), xOffset + 4, currentY + 6, { width: payColWidths[i] - 8, align: 'center' });
        xOffset += payColWidths[i];
      }
      currentY += 20;

      // Payments Rows
      if (payments.length === 0) {
        doc.rect(margin, currentY, contentWidth, 22).fillAndStroke('#ffffff', '#e2e8f0');
        doc.font(fontPath).fontSize(8).fillColor('#94a3b8');
        doc.text(shapeText('هیچ پرداختی برای این مشتری ثبت نشده است.'), margin, currentY + 6, { width: contentWidth, align: 'center' });
        currentY += 22;
      } else {
        const methodMap: Record<string, string> = {
          card_to_card: 'کارت به کارت',
          bank_transfer: 'کارت به کارت',
          pos: 'کارت به کارت',
          cash: 'وجه نقد',
          other: 'کارت به کارت'
        };

        let isAlt = false;
        for (const p of payments) {
          if (currentY > 740) {
            doc.addPage();
            currentY = margin;
          }

          const rowBg = isAlt ? '#f8fafc' : '#ffffff';
          doc.rect(margin, currentY, contentWidth, 18).fillAndStroke(rowBg, '#e2e8f0');

          xOffset = margin;
          const rowData = [
            p.tracking_code || p.notes || '-',
            methodMap[p.payment_method] || p.payment_method,
            formatToman(p.amount),
            p.payment_date,
            `#${p.id}`
          ];

          for (let i = 0; i < rowData.length; i++) {
            const isAmount = i === 2;
            doc.font(fontPath).fontSize(7.5).fillColor(isAmount ? '#15803d' : '#334155');
            doc.text(shapeText(rowData[i]), xOffset + 4, currentY + 5, { width: payColWidths[i] - 8, align: 'center' });
            xOffset += payColWidths[i];
          }

          currentY += 18;
          isAlt = !isAlt;
        }
      }

      currentY += 20;

      // Footer Verification Note
      if (currentY > 760) {
        doc.addPage();
        currentY = margin;
      }

      doc.rect(margin, currentY, contentWidth, 28).fillAndStroke('#f8fafc', '#cbd5e1');
      doc.font(fontPath).fontSize(7).fillColor('#64748b');
      doc.text(
        shapeText('این سند به صورت خودکار از سامانه حسابداری استخراج شده و به عنوان صورت‌حساب مالی مشتری معتبر است.'),
        margin + 8,
        currentY + 10,
        { width: contentWidth - 16, align: 'center' }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
