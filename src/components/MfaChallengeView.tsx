import React, {useState} from 'react';
import {AlertCircle, LogOut, ShieldCheck} from 'lucide-react';
import {supabase} from '../lib/supabase';
import {HatlyLogo} from './HatlyLogo';
import {PWAInstallButton} from './PWAInstallButton';

interface MfaChallengeViewProps {
  factorId: string | null;
  userEmail: string;
  initialError?: string | null;
  onVerified: () => Promise<void>;
  onSignOut: () => Promise<void>;
}

function formatMfaChallengeError(message: string | undefined): string {
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
  return message ? `تعذر التحقق من الكود: ${message}` : 'الكود غير صحيح';
}

export const MfaChallengeView: React.FC<MfaChallengeViewProps> = ({
  factorId,
  userEmail,
  initialError = null,
  onVerified,
  onSignOut,
}) => {
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(initialError);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanedCode = code.replace(/\D/g, '');
    if (cleanedCode.length !== 6) {
      setErrorMsg('يرجى إدخال الكود المكون من 6 أرقام');
      return;
    }

    setVerifying(true);
    try {
      let resolvedFactorId = factorId;
      if (!resolvedFactorId) {
        const factorsRes = await supabase.auth.mfa.listFactors();
        const verifiedFactor =
          factorsRes.data?.totp?.[0] ??
          factorsRes.data?.all?.find((f) => f.status === 'verified');
        resolvedFactorId = verifiedFactor?.id ?? null;
      }

      if (!resolvedFactorId) {
        setErrorMsg('لم يتم العثور على عامل المصادقة الثنائية لهذا الحساب');
        return;
      }

      const {data: challengeData, error: challengeError} =
        await supabase.auth.mfa.challenge({factorId: resolvedFactorId});

      if (challengeError || !challengeData?.id) {
        setErrorMsg(formatMfaChallengeError(challengeError?.message));
        return;
      }

      const {error: verifyError} = await supabase.auth.mfa.verify({
        factorId: resolvedFactorId,
        challengeId: challengeData.id,
        code: cleanedCode,
      });

      if (verifyError) {
        setErrorMsg(formatMfaChallengeError(verifyError.message));
        return;
      }

      await onVerified();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? formatMfaChallengeError(err.message) : 'الكود غير صحيح'
      );
    } finally {
      setVerifying(false);
    }
  };

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
            <span>التحقق بخطوتين (Google Authenticator)</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-balance">
            أدخل رمز التحقق
          </h1>
          <p className="mt-1.5 text-sm text-slate-300 leading-relaxed">
            افتح تطبيق Google Authenticator وأدخل الرقم المكون من 6 أرقام للمتابعة.
          </p>
        </div>
      </div>

      {/* Challenge Form Card */}
      <main className="max-w-md mx-auto w-full px-5 -mt-6 flex-1 flex flex-col justify-start">
        <form
          onSubmit={handleSubmit}
          className="rounded-3xl bg-white border border-slate-200 p-6 sm:p-7 shadow-xs space-y-5"
        >
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

          <div>
            <label
              htmlFor="mfa-challenge-code"
              className="block text-sm font-bold text-[#0A192F] mb-2"
            >
              رمز Google Authenticator (6 أرقام)
            </label>
            <input
              id="mfa-challenge-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              dir="ltr"
              required
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              placeholder="000000"
              className="w-full min-h-[54px] rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-2xl font-extrabold tracking-[0.45em] text-[#0A192F] tabular-nums placeholder:text-slate-300 focus:border-[#FF7B00] focus:outline-none focus:ring-2 focus:ring-[#FF7B00]/20"
            />
          </div>

          <button
            type="submit"
            disabled={verifying || code.length !== 6}
            className="w-full min-h-[52px] rounded-xl bg-[#FF7B00] px-4 py-3.5 text-base font-extrabold text-white hover:bg-[#E56E00] active:scale-[0.99] disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed transition-all cursor-pointer shadow-xs"
          >
            {verifying ? 'جاري التحقق...' : 'تأكيد'}
          </button>

          <button
            type="button"
            onClick={() => void onSignOut()}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            <span>تسجيل الخروج</span>
          </button>
        </form>
      </main>

      <footer className="py-6 text-center text-xs text-slate-400">
        هاتلي للتوصيل السريع · حماية الدخول الثنائي
      </footer>
    </div>
  );
};
