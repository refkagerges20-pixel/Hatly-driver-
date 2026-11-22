import React, {useState} from 'react';
import {AlertCircle, Clock, Eye, EyeOff, LogOut, RefreshCw} from 'lucide-react';
import {HatlyLogo} from './HatlyLogo';
import {PWAInstallButton} from './PWAInstallButton';
import type {CourierProfile} from '../types/hatly';

interface LoginViewProps {
  onLogin: (email: string, password: string) => Promise<string | null>;
  pendingCourier: CourierProfile | null;
  noProfileFound?: boolean;
  onRefreshProfile: () => Promise<void>;
  onSignOut: () => Promise<void>;
  loading: boolean;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onLogin,
  pendingCourier,
  noProfileFound = false,
  onRefreshProfile,
  onSignOut,
  loading,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!email.trim() || !password) {
      setErrorMsg('يرجى إدخال البريد الإلكتروني وكلمة المرور');
      return;
    }
    setSubmitting(true);
    const err = await onLogin(email.trim(), password);
    setSubmitting(false);
    if (err) {
      setErrorMsg(err);
    }
  };

  if (pendingCourier || noProfileFound) {
    return (
      <div className="min-h-screen bg-[#F6F8FB] flex flex-col justify-between p-5 sm:p-8">
        <header className="max-w-md mx-auto w-full flex items-center justify-between">
          <HatlyLogo size="md" />
          <PWAInstallButton variant="compact" />
        </header>

        <main className="max-w-md mx-auto w-full my-8 rounded-3xl bg-white border border-slate-200 p-6 sm:p-8 shadow-xs">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FF7B00]/12 text-[#FF7B00]">
            <Clock className="h-8 w-8" />
          </div>

          <h1 className="text-center text-2xl font-extrabold text-[#0A192F] text-balance">
            حسابك قيد المراجعة
          </h1>

          <p className="mt-3 text-center text-sm leading-relaxed text-slate-600">
            {noProfileFound
              ? 'تم تسجيل دخولك بنجاح، لكن ملف المندوب غير مفعل أو قيد التجهيز حالياً. يرجى التواصل مع إدارة هاتلي.'
              : 'نراجع بيانات حسابك حالياً في إدارة عمليات هاتلي. سيتم تفعيل حسابك فور اعتماد الأوراق والبيانات.'}
          </p>

          {pendingCourier && (
            <div className="mt-6 rounded-2xl bg-[#F6F8FB] border border-slate-200 p-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">الاسم</span>
                <span className="font-bold text-[#0A192F]">{pendingCourier.fullName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">البريد الإلكتروني</span>
                <span className="font-semibold text-[#0A192F] tabular-nums" dir="ltr">
                  {pendingCourier.email}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">حالة الحساب</span>
                <span className="font-bold text-[#FF7B00]">{pendingCourier.accountStatus}</span>
              </div>
            </div>
          )}

          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={() => void onRefreshProfile()}
              disabled={loading}
              className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-[#0A192F] px-4 py-3 text-sm font-bold text-white hover:bg-[#13294B] disabled:opacity-60 transition-colors cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>تحديث حالة الحساب</span>
            </button>

            <button
              type="button"
              onClick={() => void onSignOut()}
              className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              <span>تسجيل الخروج</span>
            </button>
          </div>
        </main>

        <footer className="max-w-md mx-auto w-full text-center text-xs text-slate-400">
          هاتلي للتوصيل السريع · بوابة المناديب
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F8FB] flex flex-col justify-between">
      {/* Top Navy Brand Header */}
      <div className="bg-[#0A192F] text-white px-5 pt-6 pb-12 rounded-b-[28px]">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <HatlyLogo size="md" light />
          <PWAInstallButton variant="compact" />
        </div>
        <div className="max-w-md mx-auto mt-7">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-balance">
            تسجيل دخول المندوب
          </h1>
          <p className="mt-1.5 text-sm text-slate-300 leading-relaxed">
            سجل الدخول لمتابعة طلباتك النشطة وإدارة العهدة النقدية لحظياً
          </p>
        </div>
      </div>

      {/* Login Form Card */}
      <main className="max-w-md mx-auto w-full px-5 -mt-6 flex-1 flex flex-col justify-start">
        <form
          onSubmit={handleSubmit}
          className="rounded-3xl bg-white border border-slate-200 p-6 sm:p-7 shadow-xs space-y-5"
        >
          {errorMsg && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-2xl bg-red-50 border border-red-200 p-3.5 text-sm text-red-800"
            >
              <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <span className="font-medium leading-snug">{errorMsg}</span>
            </div>
          )}

          <div>
            <label
              htmlFor="courier-email"
              className="block text-sm font-bold text-[#0A192F] mb-2"
            >
              البريد الإلكتروني
            </label>
            <input
              id="courier-email"
              type="email"
              autoComplete="email"
              required
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="courier@hatly.app"
              className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white px-4 py-3 text-left text-sm font-medium text-[#0A192F] placeholder:text-slate-400 focus:border-[#FF7B00] focus:outline-none focus:ring-2 focus:ring-[#FF7B00]/20"
            />
          </div>

          <div>
            <label
              htmlFor="courier-password"
              className="block text-sm font-bold text-[#0A192F] mb-2"
            >
              كلمة المرور
            </label>
            <div className="relative">
              <input
                id="courier-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white pl-12 pr-4 py-3 text-left text-sm font-medium text-[#0A192F] placeholder:text-slate-400 focus:border-[#FF7B00] focus:outline-none focus:ring-2 focus:ring-[#FF7B00]/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute left-1 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 hover:text-[#0A192F] cursor-pointer"
                aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || loading}
            className="w-full min-h-[52px] rounded-xl bg-[#FF7B00] px-4 py-3.5 text-base font-extrabold text-white hover:bg-[#E56E00] active:scale-[0.99] disabled:opacity-60 transition-all cursor-pointer shadow-xs"
          >
            {submitting || loading ? 'جاري تسجيل الدخول...' : 'دخول'}
          </button>
        </form>
      </main>

      <footer className="py-6 text-center text-xs text-slate-400">
        هاتلي للتوصيل السريع · نظام إدارة المناديب
      </footer>
    </div>
  );
};
