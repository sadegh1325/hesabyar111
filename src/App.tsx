/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Sidebar, navItems } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { LoginPage } from './components/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { NewSalePage } from './pages/NewSalePage';
import { InvoicesPage } from './pages/InvoicesPage';
import { CustomersPage } from './pages/CustomersPage';
import { ReceivablesPage } from './pages/ReceivablesPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { ProductsPage } from './pages/ProductsPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { PrintInvoiceModal } from './components/PrintInvoiceModal';
import { PrintReceiptModal } from './components/PrintReceiptModal';
import { PrintStatementModal } from './components/PrintStatementModal';
import { PaymentModal } from './components/PaymentModal';
import { Customer, Product, Invoice, Payment } from './types';
import { fetchApi, setAuthToken, downloadFile } from './lib/api';
import { OfflineIndicator } from './components/OfflineIndicator';

export default function App() {
  const [currentUser, setCurrentUser] = useState<{ id: number; username: string; fullName: string } | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // App Navigation
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Core Data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [storeSettings, setStoreSettings] = useState<Record<string, string>>({});

  // Modals state
  const [printInvoiceData, setPrintInvoiceData] = useState<Invoice | null>(null);
  const [printReceiptData, setPrintReceiptData] = useState<Payment | null>(null);
  const [statementData, setStatementData] = useState<any | null>(null);

  // Payment modal state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentCustomerId, setPaymentCustomerId] = useState<number | undefined>();
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<number | undefined>();

  // Check auth session
  useEffect(() => {
    let isManualLoggedOut = false;
    try {
      isManualLoggedOut = localStorage.getItem('hesabyar_manual_logout') === 'true';
    } catch {}

    const query = isManualLoggedOut ? '?noAuto=true' : '';

    fetchApi<{ authenticated: boolean; token?: string; user?: any }>(`/auth/me${query}`)
      .then((res) => {
        if (res.authenticated && res.user) {
          if (res.token) {
            setAuthToken(res.token);
          }
          setCurrentUser(res.user);
        }
      })
      .catch(() => {})
      .finally(() => setCheckingAuth(false));
  }, []);

  // Fetch core store data when logged in
  const refreshCoreData = () => {
    if (!currentUser) return;
    fetchApi<Customer[]>('/customers').then(setCustomers).catch(() => {});
    fetchApi<Product[]>('/products').then(setProducts).catch(() => {});
    fetchApi<Record<string, string>>('/settings').then(setStoreSettings).catch(() => {});
  };

  useEffect(() => {
    if (currentUser) {
      refreshCoreData();
    }
  }, [currentUser]);

  const handleLogout = async () => {
    try {
      await fetchApi('/auth/logout', { method: 'POST' });
    } catch {}
    setAuthToken(null);
    try {
      localStorage.setItem('hesabyar_manual_logout', 'true');
    } catch {}
    setCurrentUser(null);
  };

  const handleOpenStatement = async (customerId: number) => {
    try {
      const data = await fetchApi<any>(`/customers/${customerId}/statement`);
      setStatementData(data);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDownloadPdf = async (customerId: number) => {
    try {
      const cust = customers.find(c => c.id === customerId);
      // Save directly with customer name as requested: "سیوش به صورت اسم مشتری باشه"
      const filename = cust?.name ? `${cust.name.trim()}.pdf` : `صورتحساب_مشتری_${customerId}.pdf`;
      await downloadFile(`/reports/pdf/${customerId}`, filename);
    } catch (err: any) {
      console.warn('PDF report download error:', err);
      alert(`خطا در دانلود فایل PDF: ${err?.message || 'مشکلی در اتصال به سرور رخ داد.'}`);
    }
  };

  const handleOpenPaymentModal = (customerId?: number, invoiceId?: number) => {
    setPaymentCustomerId(customerId);
    setPaymentInvoiceId(invoiceId);
    setIsPaymentModalOpen(true);
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto" />
          <span className="text-xs text-slate-500 font-medium">در حال بارگذاری سامانه حسابداری...</span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage onLoginSuccess={(u) => setCurrentUser(u)} />;
  }

  const currentNav = navItems.find(item => item.id === activeTab);
  const activeTitle = currentNav?.label || 'پیشخوان';
  const storeName = storeSettings['store_name'] || 'فروشگاه حاج کریم و پسران';

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        storeName={storeName}
      />

      {/* Main Viewport */}
      <div className="flex-1 flex flex-col min-w-0 lg:mr-64">
        <OfflineIndicator />
        {/* Top Bar adhering to Top Bar Contract */}
        <TopBar
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          onNewSale={() => setActiveTab('new-sale')}
          activeTitle={activeTitle}
          storeName={storeName}
          currentUser={currentUser}
          onLogout={handleLogout}
        />

        {/* Page Content Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          {activeTab === 'dashboard' && (
            <DashboardPage
              onNavigate={setActiveTab}
              onOpenPaymentModal={() => handleOpenPaymentModal()}
            />
          )}

          {activeTab === 'new-sale' && (
            <NewSalePage
              customers={customers}
              products={products}
              onRefreshData={refreshCoreData}
              onOpenPrintInvoice={(inv) => setPrintInvoiceData(inv)}
            />
          )}

          {activeTab === 'invoices' && (
            <InvoicesPage
              onNewSale={() => setActiveTab('new-sale')}
              onOpenPrintInvoice={(inv) => setPrintInvoiceData(inv)}
              onOpenPaymentForInvoice={(inv) => handleOpenPaymentModal(inv.customer_id, inv.id)}
            />
          )}

          {activeTab === 'customers' && (
            <CustomersPage
              customers={customers}
              onRefreshData={refreshCoreData}
              onOpenStatement={handleOpenStatement}
              onOpenPaymentForCustomer={(cId) => handleOpenPaymentModal(cId)}
              onDownloadPdf={handleDownloadPdf}
            />
          )}

          {activeTab === 'receivables' && (
            <ReceivablesPage
              onOpenPaymentForCustomer={(cId) => handleOpenPaymentModal(cId)}
              onOpenStatement={handleOpenStatement}
            />
          )}

          {activeTab === 'payments' && (
            <PaymentsPage
              onOpenNewPayment={() => handleOpenPaymentModal()}
              onPrintReceipt={(p) => setPrintReceiptData(p)}
            />
          )}

          {activeTab === 'products' && (
            <ProductsPage
              products={products}
              onRefreshData={refreshCoreData}
            />
          )}

          {activeTab === 'reports' && <ReportsPage />}

          {activeTab === 'settings' && <SettingsPage />}
        </main>
      </div>

      {/* Global Modals */}
      <PrintInvoiceModal
        invoice={printInvoiceData}
        onClose={() => setPrintInvoiceData(null)}
        storeSettings={storeSettings}
      />

      <PrintReceiptModal
        payment={printReceiptData}
        onClose={() => setPrintReceiptData(null)}
        storeSettings={storeSettings}
      />

      <PrintStatementModal
        data={statementData}
        onClose={() => setStatementData(null)}
        storeSettings={storeSettings}
        onDownloadPdf={handleDownloadPdf}
      />

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        onSuccess={() => {
          refreshCoreData();
        }}
        initialCustomerId={paymentCustomerId}
        initialInvoiceId={paymentInvoiceId}
        customers={customers}
      />
    </div>
  );
}
