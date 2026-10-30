import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setJustReconnected(true);
      const timer = setTimeout(() => {
        setJustReconnected(false);
      }, 4000);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setJustReconnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline && !justReconnected) {
    return null;
  }

  if (justReconnected) {
    return (
      <div className="bg-emerald-600 text-white text-xs font-medium py-2 px-4 shadow-md transition-all duration-300 flex items-center justify-center gap-2 sticky top-0 z-50">
        <Wifi className="w-4 h-4 animate-bounce" />
        <span>اتصال مجدد اینترنت برقرار شد. سیستم با سرور همگام است.</span>
      </div>
    );
  }

  return (
    <div className="bg-amber-600 text-white text-xs font-medium py-2 px-4 shadow-md transition-all duration-300 flex items-center justify-center gap-2 sticky top-0 z-50">
      <WifiOff className="w-4 h-4 animate-pulse" />
      <span>شما در حالت آفلاین هستید. وب‌اپلیکیشن فعال است و اطلاعات ذخیره‌شده مرورگر در دسترس شماست.</span>
    </div>
  );
}
