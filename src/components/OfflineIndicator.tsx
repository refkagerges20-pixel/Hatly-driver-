import React, {useEffect, useState} from 'react';
import {RefreshCw, WifiOff} from 'lucide-react';
import {useOnlineStatus} from '../hooks/useOnlineStatus';
import {loadOfflineStatusQueue, OFFLINE_QUEUE_EVENT} from '../lib/supabase';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const [queuedCount, setQueuedCount] = useState<number>(
    () => loadOfflineStatusQueue().length
  );

  useEffect(() => {
    const syncCount = () => {
      setQueuedCount(loadOfflineStatusQueue().length);
    };
    window.addEventListener(OFFLINE_QUEUE_EVENT, syncCount);
    window.addEventListener('storage', syncCount);
    window.addEventListener('online', syncCount);
    return () => {
      window.removeEventListener(OFFLINE_QUEUE_EVENT, syncCount);
      window.removeEventListener('storage', syncCount);
      window.removeEventListener('online', syncCount);
    };
  }, []);

  if (isOnline && queuedCount === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-16 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-xs sm:text-sm font-bold shadow-xl border ${
        isOnline
          ? 'bg-amber-950 text-amber-100 border-amber-500/50'
          : 'bg-[#0A192F] text-white border-[#FF7B00]'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {isOnline ? (
          <RefreshCw className="h-4 w-4 text-[#FF7B00] animate-spin shrink-0" />
        ) : (
          <WifiOff className="h-4 w-4 text-[#FF7B00] shrink-0" />
        )}
        <span className="leading-snug">
          {isOnline
            ? 'عاد الاتصال — جاري إرسال التحديثات المعلقة...'
            : 'لا يوجد اتصال بالإنترنت — يتم حفظ تحديثات الحالة وإرسالها عند عودة الاتصال'}
        </span>
      </div>

      {queuedCount > 0 && (
        <span className="shrink-0 rounded-lg bg-[#FF7B00] px-2 py-0.5 text-[11px] font-extrabold text-white tabular-nums">
          {queuedCount} معلق
        </span>
      )}
    </div>
  );
};
