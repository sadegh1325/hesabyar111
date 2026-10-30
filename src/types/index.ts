export interface Customer {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  is_active: number;
  created_at: string;
  balance?: number;
  totalInvoiced?: number;
  totalPaid?: number;
  openInvoicesCount?: number;
  lastPaymentDate?: string | null;
}

export interface Product {
  id: number;
  name: string;
  category?: string;
  quantity?: number;
  code: string | null;
  unit: string;
  default_sale_price: number;
  purchase_price: number;
  notes: string | null;
  is_active: number;
}

export interface InvoiceItem {
  id?: number;
  productId?: number | null;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  purchasePrice?: number;
  discountAmount: number;
  totalAmount: number;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  customer_id: number;
  customer_name_snapshot: string;
  customer_name?: string;
  customer_phone?: string;
  issue_date: string;
  due_date: string | null;
  subtotal: number;
  discount_type: 'amount' | 'percent';
  discount_value: number;
  discount_amount: number;
  additional_charges: number;
  final_total: number;
  paid_amount: number;
  remaining_amount: number;
  status: 'draft' | 'unpaid' | 'partially_paid' | 'paid' | 'adjusted' | 'cancelled';
  notes: string | null;
  created_at: string;
  items?: InvoiceItem[];
  allocations?: any[];
}

export interface Payment {
  id: number;
  customer_id: number;
  customer_name?: string;
  customer_phone?: string;
  amount: number;
  payment_date: string;
  payment_method: 'cash' | 'pos' | 'bank_transfer' | 'other';
  tracking_code: string | null;
  notes: string | null;
  status: 'valid' | 'refunded' | 'voided';
  created_at: string;
  allocations?: Array<{
    amount: number;
    invoice_number: string;
    invoice_id: number;
  }>;
}

export interface Debtor {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  totalDebt: number;
  openInvoicesCount: number;
  firstDebtDate: string | null;
  lastPaymentDate: string | null;
}

export interface DashboardData {
  todaySales: number;
  monthSales: number;
  todayReceipts: number;
  monthReceipts: number;
  totalReceivables: number;
  debtorCount: number;
  todayInvoicesCount: number;
  unpaidInvoicesCount: number;
  estimatedGrossProfit: number;
  salesTrend: Array<{ date: string; sales: number; receipts: number }>;
  topProducts: Array<{ product_name: string; total_qty: number; total_amount: number }>;
  topCustomers: Array<{ name: string; total_spent: number; invoice_count: number }>;
}
