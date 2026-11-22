import React, {useState} from 'react';
import {Download, Share, X} from 'lucide-react';
import {usePWAInstall} from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'full';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'compact',
}) => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={
          variant === 'full'
            ? 'w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-[#0A192F] px-4 py-3 text-sm font-bold text-white hover:bg-[#13294B] active:scale-[0.99] transition-all cursor-pointer whitespace-nowrap'
            : 'min-h-[40px] flex items-center gap-1.5 rounded-xl bg-[#FF7B00] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#E56E00] active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap shrink-0'
        }
      >
        <Download className="h-4 w-4 shrink-0" />
        <span>تثبيت التطبيق</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={
            variant === 'full'
              ? 'w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-[#0A192F] hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap'
              : 'min-h-[40px] flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition-colors cursor-pointer whitespace-nowrap shrink-0'
          }
        >
          <Download className="h-3.5 w-3.5 shrink-0" />
          <span>تثبيت على iOS</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
          >
            <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl border border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <h3 id="ios-install-title" className="text-lg font-bold text-[#0A192F]">
                  تثبيت تطبيق هاتلي على الآيفون
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer"
                  aria-label="إغلاق"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <ol className="space-y-3 text-sm text-slate-700 leading-relaxed">
                <li className="flex items-start gap-2.5">
                  <span className="h-6 w-6 rounded-lg bg-[#0A192F] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                    1
                  </span>
                  <span>
                    اضغط على أيقونة المشاركة <Share className="inline h-4 w-4 text-[#FF7B00]" /> في شريط متصفح Safari.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="h-6 w-6 rounded-lg bg-[#0A192F] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                    2
                  </span>
                  <span>
                    مرر للأسفل واختر <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.
                  </span>
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 w-full min-h-[48px] rounded-xl bg-[#0A192F] py-3 text-sm font-bold text-white hover:bg-[#13294B] cursor-pointer"
              >
                فهمت
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
