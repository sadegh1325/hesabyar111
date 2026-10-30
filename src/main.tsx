import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Register PWA Service Worker for offline capability and instant loading
registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('نسخه جدید برنامه حساب‌یار آماده به‌روزرسانی است.');
  },
  onOfflineReady() {
    console.log('برنامه حساب‌یار برای حالت آفلاین آماده است.');
  },
});

createRoot(document.getElementById('root')!).render(<App />);

