import React from 'react';
import {
  Bike,
  CheckCircle2,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  User,
} from 'lucide-react';
import type {CourierProfile} from '../types/hatly';
import {PWAInstallButton} from './PWAInstallButton';

const SUPPORT_WHATSAPP_NUMBER = '201012345678';

interface ProfileViewProps {
  courier: CourierProfile;
  completedCount: number;
  onSignOut: () => Promise<void>;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  courier,
  completedCount,
  onSignOut,
}) => {
  const courierName = courier.fullName?.trim() || 'مندوب هاتلي';
  const supportMessage = `مرحباً، أنا المندوب ${courierName}، أحتاج مساعدة بخصوص [أكتب المشكلة]`;
  const supportWhatsappUrl = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(
    supportMessage
  )}`;

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      {/* Header Profile Card */}
      <section className="rounded-3xl bg-[#0A192F] text-white p-6 flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#FF7B00] text-white">
          <User className="h-8 w-8" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-extrabold truncate">{courier.fullName}</h2>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-300">
            <span className="inline-flex items-center gap-1 text-emerald-400 font-bold">
              <CheckCircle2 className="h-3.5 w-3.5" />
              حساب مفعل
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{completedCount} طلب مكتمل</span>
          </div>
        </div>
      </section>

      {/* Account Details List */}
      <section className="rounded-3xl bg-white border border-slate-200 divide-y divide-slate-100">
        <div className="px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-slate-500 text-sm">
            <Mail className="h-4 w-4 text-[#0A192F]" />
            <span>البريد الإلكتروني</span>
          </div>
          <span className="text-sm font-bold text-[#0A192F] tabular-nums" dir="ltr">
            {courier.email || '—'}
          </span>
        </div>

        <div className="px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-slate-500 text-sm">
            <Phone className="h-4 w-4 text-[#0A192F]" />
            <span>رقم الهاتف</span>
          </div>
          <span className="text-sm font-bold text-[#0A192F] tabular-nums" dir="ltr">
            {courier.phone || '—'}
          </span>
        </div>

        <div className="px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-slate-500 text-sm">
            <Bike className="h-4 w-4 text-[#0A192F]" />
            <span>المركبة</span>
          </div>
          <span className="text-sm font-bold text-[#0A192F]">
            {courier.vehicleType || 'دراجة نارية'}
          </span>
        </div>

        <div className="px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-slate-500 text-sm">
            <ShieldCheck className="h-4 w-4 text-[#0A192F]" />
            <span>حالة الاعتماد</span>
          </div>
          <span className="text-sm font-bold text-emerald-700">
            {courier.accountStatus === 'active' ? 'نشط ومعتمد' : courier.accountStatus}
          </span>
        </div>

        <div className="px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-slate-500 text-sm">
            <MapPin className="h-4 w-4 text-[#0A192F]" />
            <span>آخر إحداثيات GPS</span>
          </div>
          <span className="text-xs font-bold text-slate-700 tabular-nums" dir="ltr">
            {typeof courier.currentLat === 'number' &&
            Number.isFinite(courier.currentLat) &&
            typeof courier.currentLng === 'number' &&
            Number.isFinite(courier.currentLng)
              ? `${courier.currentLat.toFixed(5)}, ${courier.currentLng.toFixed(5)}`
              : 'غير متاح'}
          </span>
        </div>
      </section>

      {/* Technical Support (WhatsApp) Button */}
      <a
        href={supportWhatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full min-h-[54px] flex items-center justify-center gap-2.5 rounded-2xl border-2 border-emerald-600 bg-emerald-50 px-4 py-3.5 text-base font-extrabold text-emerald-900 hover:bg-emerald-100 active:scale-[0.99] transition-all shadow-xs"
      >
        <MessageCircle className="h-5 w-5 text-emerald-600 shrink-0" />
        <span>تواصل مع الدعم الفني</span>
      </a>

      {/* PWA Install Card */}
      <PWAInstallButton variant="full" />

      {/* Sign Out Button */}
      <button
        type="button"
        onClick={() => void onSignOut()}
        className="w-full min-h-[50px] flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-extrabold text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
      >
        <LogOut className="h-4 w-4" />
        <span>تسجيل الخروج</span>
      </button>
    </div>
  );
};
