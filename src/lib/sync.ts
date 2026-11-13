import { fetchApi } from './api';

export interface FullDbSnapshot {
  version: number;
  revision: number;
  driver?: 'turso' | 'sqlite';
  exportedAt?: string;
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

const IDB_NAME = 'hesabyar_offline_sync_db';
const IDB_STORE = 'snapshots';
const IDB_KEY = 'full_db_v2';
const LS_KEY = 'hesabyar_full_db_v2';
const LEGACY_CUST_KEY = 'hesabyar_persisted_customers_v1';
const LEGACY_PROD_KEY = 'hesabyar_persisted_products_v1';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB unavailable'));
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readIdbSnapshot(): Promise<FullDbSnapshot | null> {
  try {
    const db = await openIdb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_KEY);
      req.onsuccess = () => resolve((req.result as FullDbSnapshot) || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function writeIdbSnapshot(snapshot: FullDbSnapshot): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(snapshot, IDB_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {}
}

export async function getLocalSnapshot(): Promise<FullDbSnapshot | null> {
  const fromIdb = await readIdbSnapshot();
  if (fromIdb) return fromIdb;

  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      return JSON.parse(raw) as FullDbSnapshot;
    }

    // Migrate legacy v1 customers/products backups if present
    const legacyCustRaw = localStorage.getItem(LEGACY_CUST_KEY);
    const legacyProdRaw = localStorage.getItem(LEGACY_PROD_KEY);
    const legacyCust = legacyCustRaw ? JSON.parse(legacyCustRaw) : [];
    const legacyProd = legacyProdRaw ? JSON.parse(legacyProdRaw) : [];
    if ((Array.isArray(legacyCust) && legacyCust.length > 1) || (Array.isArray(legacyProd) && legacyProd.length > 0)) {
      return {
        version: 2,
        revision: 0,
        app_settings: [],
        customers: Array.isArray(legacyCust) ? legacyCust : [],
        products: Array.isArray(legacyProd) ? legacyProd : [],
        invoices: [],
        invoice_items: [],
        payments: [],
        payment_allocations: [],
        customer_credits: [],
        expenses: [],
        financial_adjustments: [],
        audit_logs: []
      };
    }
  } catch {}

  return null;
}

export async function saveLocalSnapshot(snapshot: FullDbSnapshot): Promise<void> {
  await writeIdbSnapshot(snapshot);
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(snapshot));
    if (Array.isArray(snapshot.customers)) {
      localStorage.setItem(LEGACY_CUST_KEY, JSON.stringify(snapshot.customers));
    }
    if (Array.isArray(snapshot.products)) {
      localStorage.setItem(LEGACY_PROD_KEY, JSON.stringify(snapshot.products));
    }
  } catch {}
}

function getDataScore(s: Partial<FullDbSnapshot> | null | undefined): number {
  if (!s) return 0;
  const custCount = Array.isArray(s.customers) ? s.customers.filter((c) => Number(c.id) !== 1).length : 0;
  const prodCount = Array.isArray(s.products) ? s.products.length : 0;
  const invCount = Array.isArray(s.invoices) ? s.invoices.length : 0;
  const payCount = Array.isArray(s.payments) ? s.payments.length : 0;
  const expCount = Array.isArray(s.expenses) ? s.expenses.length : 0;
  return custCount + prodCount + invCount + payCount + expCount;
}

function hasMissingRecordsOnServer(local: FullDbSnapshot, server: FullDbSnapshot): boolean {
  const checkMissing = (localArr: any[] = [], serverArr: any[] = [], key = 'id') => {
    const serverIds = new Set(serverArr.map((r) => String(r[key])));
    return localArr.some((r) => r[key] !== undefined && !serverIds.has(String(r[key])));
  };

  return (
    checkMissing(local.customers, server.customers) ||
    checkMissing(local.products, server.products) ||
    checkMissing(local.invoices, server.invoices) ||
    checkMissing(local.payments, server.payments) ||
    checkMissing(local.expenses, server.expenses)
  );
}

let syncInFlight: Promise<{ snapshot: FullDbSnapshot; syncedFromClient: boolean }> | null = null;

/**
 * Full bidirectional reconciliation between local persistent cache (IndexedDB + localStorage)
 * and the server database (SQLite / Turso Cloud).
 */
export async function syncFullDatabaseWithServer(): Promise<{
  snapshot: FullDbSnapshot;
  syncedFromClient: boolean;
}> {
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    try {
      const [serverSnapshot, localSnapshot] = await Promise.all([
        fetchApi<FullDbSnapshot>('/sync/full'),
        getLocalSnapshot()
      ]);

      const serverScore = getDataScore(serverSnapshot);
      const localScore = getDataScore(localSnapshot);

      const shouldPushToServer =
        Boolean(localSnapshot) &&
        ((serverScore === 0 && localScore > 0) ||
          (localSnapshot !== null &&
            localScore > 0 &&
            serverSnapshot.driver !== 'turso' &&
            hasMissingRecordsOnServer(localSnapshot, serverSnapshot)));

      if (shouldPushToServer && localSnapshot) {
        const res = await fetchApi<{ success: boolean; snapshot: FullDbSnapshot }>('/sync/full', {
          method: 'POST',
          body: JSON.stringify({ snapshot: localSnapshot, mode: 'merge' })
        });
        await saveLocalSnapshot(res.snapshot);
        return { snapshot: res.snapshot, syncedFromClient: true };
      }

      await saveLocalSnapshot(serverSnapshot);
      return { snapshot: serverSnapshot, syncedFromClient: false };
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

/**
 * Pull latest full snapshot from server after any write mutation
 */
export async function pullAndCacheSnapshot(): Promise<FullDbSnapshot | null> {
  try {
    const serverSnapshot = await fetchApi<FullDbSnapshot>('/sync/full');
    await saveLocalSnapshot(serverSnapshot);
    return serverSnapshot;
  } catch {
    return null;
  }
}

/**
 * Manually trigger full sync + financial & stock integrity reconciliation
 */
export async function reconcileAndSyncDatabase(): Promise<{
  success: boolean;
  stats: { invoicesRecalculated: number; revision: number };
  health: any;
  snapshot: FullDbSnapshot;
}> {
  await syncFullDatabaseWithServer();
  const res = await fetchApi<{
    success: boolean;
    stats: { invoicesRecalculated: number; revision: number };
    health: any;
    snapshot: FullDbSnapshot;
  }>('/sync/reconcile', { method: 'POST' });
  await saveLocalSnapshot(res.snapshot);
  return res;
}
