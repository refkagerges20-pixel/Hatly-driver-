import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  KeyRound,
  LogOut,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {HatlyLogo} from './HatlyLogo';
import {PWAInstallButton} from './PWAInstallButton';

interface MfaEnrollmentViewProps {
  userEmail: string;
  onEnrolled: () => Promise<void>;
  onSignOut: () => Promise<void>;
}

function formatMfaVerifyError(message: string | undefined): string {
  const lower = String(message ?? '').toLowerCase();
  if (
    lower.includes('invalid') ||
    lower.includes('expired') ||
    lower.includes('totp') ||
    lower.includes('code') ||
    lower.includes('mismatch') ||
    lower.includes('verification')
  ) {
    return 'الكود غير صحيح';
  }
  return message ? `تعذر تأكيد الكود: ${message}` : 'الكود غير صحيح';
}

export const MfaEnrollmentView: React.FC<MfaEnrollmentViewProps> = ({
  userEmail,
  onEnrolled,
  onSignOut,
}) => {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCodeSvg, setQrCodeSvg] = useState<string | null>(null);
  const [secret, setSecret] = useState<string>('');
  const [code, setCode] = useState('');
  const [enrolling, setEnrolling] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const startedRef = useRef(false);

  const startEnrollment = useCallback(async () => {
    setEnrolling(true);
    setErrorMsg(null);
    try {
      // Remove any stale unverified TOTP factors left over from abandoned attempts
      const factorsRes = await supabase.auth.mfa.listFactors();
      const unverifiedTotp = (factorsRes.data?.all ?? []).filter(
        (f) => f.factor_type === 'totp' && f.status === 'unverified'
      );
      for (const stale of unverifiedTotp) {
        await supabase.auth.mfa.unenroll({factorId: stale.id});
      }

      const {data, error} = await supabase.auth.mfa.enroll({
        factorType: 'totp',
      });

      if (error || !data) {
        setErrorMsg(
          error?.message
            ? `تعذر تهيئة المصادقة الثنائية: ${error.message}`
            : 'تعذر إنشاء رمز المصادقة الثنائية حالياً'
        );
        return;
      }

      setFactorId(data.id);
      setQrCodeSvg(data.totp.qr_code);
      setSecret(data.totp.secret);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'حدث خطأ أثناء تهيئة المصادقة الثنائية'
      );
    } finally {
      setEnrolling(false);
    }
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void startEnrollment();
  }, [startEnrollment]);

  const handleCopySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may be unavailable on non-HTTPS contexts
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanedCode = code.replace(/\D/g, '');
    if (cleanedCode.length !== 6) {
      setErrorMsg('يرجى إدخال الكود المكون من 6 أرقام');
      return;
    }
    if (!factorId) {
      setErrorMsg('تعذر تحديد معامل المصادقة، يرجى إعادة إنشاء الرمز');
      return;
    }

    setVerifying(true);
    try {
      const {data: challengeData, error: challengeError} =
        await supabase.auth.mfa.challenge({factorId});

      if (challengeError || !challengeData?.id) {
        setErrorMsg(formatMfaVerifyError(challengeError?.message));
        return;
      }

      const {error: verifyError} = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: cleanedCode,
      });

      if (verifyError) {
        setErrorMsg(formatMfaVerifyError(verifyError.message));
        return;
      }

      await onEnrolled();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? formatMfaVerifyError(err.message) : 'الكود غير صحيح'
      );
    } finally {
      setVerifying(false);
    }
  };

  const qrImageSrc = qrCodeSvg
    ? qrCodeSvg.startsWith('data:')
      ? qrCodeSvg
      : `data:image/svg+xml;utf-8,${encodeURIComponent(qrCodeSvg)}`
    : null;

  return (
    <div className="min-h-screen bg-[#F6F8FB] flex flex-col justify-between" dir="rtl">
      {/* Top Navy Brand Header */}
      <div className="bg-[#0A192F] text-white px-5 pt-6 pb-12 rounded-b-[28px]">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <HatlyLogo size="md" light />
          <PWAInstallButton variant="compact" />
        </div>
        <div className="max-w-md mx-auto mt-6">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-[#FF7B00] mb-1.5">
            <ShieldCheck className="h-4 w-4" />
            <span>المصادقة الثنائية (Google Authenticator)</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-balance">
            تأمين الحساب
          </h1>
          <p className="mt-1.5 text-sm text-slate-300 leading-relaxed">
            افتح تطبيق Google Authenticator وامسح الكود، ثم أدخل الرقم المكون من 6 أرقام.
          </p>
        </div>
      </div>

      {/* Enrollment Card */}
      <main className="max-w-md mx-auto w-full px-5 -mt-6 flex-1 flex flex-col justify-start">
        <div className="rounded-3xl bg-white border border-slate-200 p-6 sm:p-7 shadow-xs space-y-5">
          {userEmail && (
            <div className="rounded-2xl bg-[#F6F8FB] border border-slate-200 px-3.5 py-2.5 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-semibold">الحساب</span>
              <span className="font-bold text-[#0A192F]" dir="ltr">
                {userEmail}
              </span>
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-2xl bg-red-50 border border-red-200 p-3.5 text-sm text-red-800"
            >
              <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <span className="font-bold leading-snug">{errorMsg}</span>
            </div>
          )}

          {enrolling ? (
            <div className="py-10 flex flex-col items-center justify-center gap-3 text-slate-500">
              <RefreshCw className="h-7 w-7 animate-spin text-[#FF7B00]" />
              <p className="text-sm font-bold text-[#0A192F]">
                جاري تجهيز رمز المصادقة الثنائية...
              </p>
            </div>
          ) : qrImageSrc ? (
            <div className="space-y-4">
              {/* QR Code */}
              <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-4">
                <img
                  src={qrImageSrc}
                  alt="رمز QR لتطبيق Google Authenticator"
                  className="h-48 w-48 object-contain"
                />
              </div>

              {/* Manual TOTP Secret */}
              {secret && (
                <div className="rounded-2xl bg-[#F6F8FB] border border-slate-200 p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                      <KeyRound className="h-3.5 w-3.5 text-[#FF7B00]" />
                      <span>المفتاح السري للإدخال اليدوي</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCopySecret()}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-[#0A192F] hover:border-[#FF7B00] hover:text-[#FF7B00] transition-colors cursor-pointer"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-emerald-700">تم النسخ</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>نسخ</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p
                    dir="ltr"
                    data-testid="mfa-totp-secret"
                    className="font-mono text-xs sm:text-sm font-bold text-[#0A192F] tracking-wider break-all select-all text-center bg-white rounded-xl border border-slate-200 px-3 py-2"
                  >
                    {secret}
                  </p>
                </div>
              )}

              {/* Verification Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="mfa-enroll-code"
                    className="block text-sm font-bold text-[#0A192F] mb-2"
                  >
                    أدخل الكود المكون من 6 أرقام
                  </label>
                  <input
                    id="mfa-enroll-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    dir="ltr"
                    required
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    placeholder="000000"
                    className="w-full min-h-[52px] rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-2xl font-extrabold tracking-[0.45em] text-[#0A192F] tabular-nums placeholder:text-slate-300 focus:border-[#FF7B00] focus:outline-none focus:ring-2 focus:ring-[#FF7B00]/20"
                  />
                </div>

                <button
                  type="submit"
                  disabled={verifying || code.length !== 6}
                  className="w-full min-h-[52px] rounded-xl bg-[#FF7B00] px-4 py-3.5 text-base font-extrabold text-white hover:bg-[#E56E00] active:scale-[0.99] disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed transition-all cursor-pointer shadow-xs"
                >
                  {verifying ? 'جاري التحقق والتفعيل...' : 'تأكيد'}
                </button>
              </form>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void startEnrollment()}
              className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-[#0A192F] px-4 py-3 text-sm font-bold text-white hover:bg-[#13294B] cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
              <span>إعادة إنشاء رمز المصادقة</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void onSignOut()}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </main>

      <footer className="py-6 text-center text-xs text-slate-400">
        هاتلي للتوصيل السريع · تأمين حساب المندوب
      </footer>
    </div>
  );
};
