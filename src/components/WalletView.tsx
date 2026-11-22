import React, {useState} from 'react';
import {
  AlertTriangle,
  ExternalLink,
  Eye,
  Receipt,
  Upload,
  X,
} from 'lucide-react';
import {
  CASH_LOCK_LIMIT_EGP,
  formatDateArabic,
  formatEGP,
} from '../lib/supabase';
import type {CourierDeposit} from '../types/hatly';

interface WalletViewProps {
  custodyBalance: number;
  deposits: CourierDeposit[];
  onOpenDeposit: () => void;
}

export const WalletView: React.FC<WalletViewProps> = ({
  custodyBalance,
  deposits,
  onOpenDeposit,
}) => {
  const [previewReceiptUrl, setPreviewReceiptUrl] = useState<string | null>(null);

  const safeDeposits = Array.isArray(deposits) ? deposits : [];
  const remainingBalance = Number.isFinite(Number(custodyBalance))
    ? Math.max(0, Number(custodyBalance))
    : 0;
  const isLocked = remainingBalance >= CASH_LOCK_LIMIT_EGP;

  return (
    <div className="space-y-5">
      {/* Main Balance Card: المبلغ المطلوب توريده */}
      <section
        className={`rounded-3xl p-6 sm:p-7 border space-y-5 ${
          isLocked
            ? 'bg-red-600 text-white border-red-700'
            : 'bg-[#0A192F] text-white border-[#0A192F]'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-white/80">
              المبلغ المطلوب توريده
            </p>
            <p className="mt-2 text-4xl sm:text-5xl font-extrabold tracking-tight tabular-nums">
              {formatEGP(remainingBalance)}{' '}
              <span className="text-base font-bold text-[#FF7B00]">ج.م</span>
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenDeposit}
            className="w-full sm:w-auto min-h-[52px] inline-flex items-center justify-center gap-2 rounded-2xl bg-[#FF7B00] px-6 py-3.5 text-base font-extrabold text-white hover:bg-[#E56E00] active:scale-[0.99] transition-all cursor-pointer whitespace-nowrap shadow-sm"
          >
            <Upload className="h-5 w-5 shrink-0" />
            <span>تسجيل توريد</span>
          </button>
        </div>

        {isLocked && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-2xl bg-black/20 px-4 py-3 text-xs sm:text-sm text-white"
          >
            <AlertTriangle className="h-5 w-5 text-white shrink-0 mt-0.5" />
            <span className="font-bold leading-relaxed">
              يجب توريد المبلغ لفتح الحساب — تجاوزت الحد الأقصى المسموح ({formatEGP(CASH_LOCK_LIMIT_EGP)} ج.م).
            </span>
          </div>
        )}
      </section>

      {/* Scrollable Deposit History Table */}
      <section className="rounded-3xl bg-white border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-extrabold text-[#0A192F]">سجل التوريدات</h2>
          <span className="text-xs font-semibold text-slate-500 tabular-nums">
            {safeDeposits.length} عملية
          </span>
        </div>

        {safeDeposits.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F6F8FB] text-slate-400">
              <Receipt className="h-6 w-6" />
            </div>
            <p className="text-sm font-bold text-[#0A192F]">لا توجد توريدات مسجلة بعد</p>
            <p className="text-xs text-slate-500">
              عند توريد المبالغ المحصلة، اضغط على «تسجيل توريد» وأرفق صورة الإيصال.
            </p>
          </div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-right border-collapse">
              <thead className="sticky top-0 bg-[#F6F8FB] border-b border-slate-200 text-xs font-bold text-slate-500">
                <tr>
                  <th className="py-3 px-4 sm:px-5">التاريخ</th>
                  <th className="py-3 px-4 sm:px-5">المبلغ</th>
                  <th className="py-3 px-4 sm:px-5 text-center">الإيصال</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {safeDeposits.map((dep) => (
                  <tr key={dep.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 sm:px-5 text-xs sm:text-sm text-slate-600 tabular-nums">
                      <div>{formatDateArabic(dep.deposit_date || dep.created_at)}</div>
                      {dep.notes && (
                        <div className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[180px]">
                          {dep.notes}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 sm:px-5 font-extrabold text-[#0A192F] tabular-nums whitespace-nowrap">
                      {formatEGP(Number(dep.amount))} ج.م
                    </td>
                    <td className="py-3.5 px-3 sm:px-5 text-center">
                      {dep.receipt_url ? (
                        <div className="inline-flex items-center justify-center gap-1.5">
                          <a
                            href={dep.receipt_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-[#FF7B00]/30 bg-[#FF7B00]/10 px-2.5 py-1.5 text-xs font-bold text-[#0A192F] hover:bg-[#FF7B00] hover:text-white transition-colors whitespace-nowrap"
                          >
                            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                            <span>عرض الإيصال</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => setPreviewReceiptUrl(dep.receipt_url)}
                            className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-xl border border-slate-200 bg-[#F6F8FB] text-[#0A192F] hover:border-[#FF7B00] hover:text-[#FF7B00] transition-colors cursor-pointer"
                            aria-label="معاينة صورة الإيصال"
                            title="معاينة صورة الإيصال"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Receipt Lightbox Modal */}
      {previewReceiptUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="معاينة إيصال التوريد"
          onClick={() => setPreviewReceiptUrl(null)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white p-4 space-y-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-[#0A192F]">صورة إيصال التوريد</h3>
              <button
                type="button"
                onClick={() => setPreviewReceiptUrl(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer"
                aria-label="إغلاق"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <img
              src={previewReceiptUrl}
              alt="إيصال التوريد"
              referrerPolicy="no-referrer"
              className="w-full max-h-[65vh] rounded-2xl object-contain bg-[#F6F8FB]"
            />
            <a
              href={previewReceiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-[#0A192F] py-2.5 text-xs font-bold text-white hover:bg-[#13294B]"
            >
              <ExternalLink className="h-4 w-4 text-[#FF7B00]" />
              <span>فتح الصورة في نافذة مستقلة</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
};
