import React from 'react';
import {Bell, CheckCheck, Loader2, RefreshCw, X} from 'lucide-react';
import {formatDateArabic} from '../lib/supabase';
import type {CourierNotification} from '../types/hatly';

interface NotificationsModalProps {
  notifications: CourierNotification[];
  highlightedUnreadIds: Set<string>;
  loading: boolean;
  onRefresh: () => Promise<void>;
  onClose: () => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  notifications,
  highlightedUnreadIds,
  loading,
  onRefresh,
  onClose,
}) => {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notifications-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white border border-slate-200 shadow-2xl max-h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 rounded-full mx-auto mt-3 shrink-0" />

        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0A192F] text-[#FF7B00]">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="notifications-modal-title"
                className="text-base sm:text-lg font-extrabold text-[#0A192F]"
              >
                الإشعارات
              </h2>
              <p className="text-[11px] font-semibold text-slate-500">
                آخر التنبيهات وتحديثات الطلبات والإدارة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void onRefresh()}
              disabled={loading}
              aria-label="تحديث الإشعارات"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 bg-[#F6F8FB]">
          {loading && notifications.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2.5 text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin text-[#FF7B00]" />
              <p className="text-xs font-bold">جاري تحميل الإشعارات...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center space-y-2.5">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F6F8FB] text-slate-400">
                <Bell className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-extrabold text-[#0A192F]">
                لا توجد إشعارات حالياً
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                ستظهر هنا إشعارات الطلبات الجديدة وتنبيهات الإدارة فور وصولها.
              </p>
            </div>
          ) : (
            notifications.map((notif) => {
              const wasJustUnread = !notif.isRead || highlightedUnreadIds.has(notif.id);
              return (
                <article
                  key={notif.id}
                  className={`rounded-2xl border p-4 space-y-1.5 transition-colors ${
                    wasJustUnread
                      ? 'bg-[#FF7B00]/6 border-[#FF7B00]/40'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                          wasJustUnread ? 'bg-[#FF7B00]' : 'bg-slate-300'
                        }`}
                        aria-hidden="true"
                      />
                      <h3 className="text-sm font-extrabold text-[#0A192F] leading-snug">
                        {notif.title}
                      </h3>
                    </div>

                    <span
                      className={`shrink-0 inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-extrabold ${
                        !notif.isRead
                          ? 'bg-red-100 text-red-700'
                          : wasJustUnread
                            ? 'bg-[#FF7B00]/15 text-[#FF7B00]'
                            : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {notif.isRead && <CheckCheck className="h-3 w-3 shrink-0" />}
                      <span>
                        {!notif.isRead
                          ? 'غير مقروء'
                          : wasJustUnread
                            ? 'جديد · مقروء'
                            : 'مقروء'}
                      </span>
                    </span>
                  </div>

                  {notif.message && (
                    <p className="text-xs text-slate-700 leading-relaxed pr-4.5">
                      {notif.message}
                    </p>
                  )}

                  <p className="text-[11px] font-semibold text-slate-400 tabular-nums pr-4.5">
                    {formatDateArabic(notif.createdAt)}
                  </p>
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
