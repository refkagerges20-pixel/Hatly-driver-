import React, {useEffect, useState} from 'react';
import {
  CalendarClock,
  Camera,
  Clock,
  Lock,
  LogOut,
  MapPin,
  PackageCheck,
  Power,
  ShieldCheck,
  Timer,
  Wallet,
} from 'lucide-react';
import {
  CASH_LOCK_LIMIT_EGP,
  evaluateShiftAvailabilityWindow,
  formatDurationHMS,
  formatEGP,
  formatShiftTimeArabic,
  getCheckInEligibility,
} from '../lib/supabase';
import type {
  CourierOrder,
  CourierProfile,
  CourierShift,
  OrderStatus,
} from '../types/hatly';
import {OrderCard} from './OrderCard';

interface HomeViewProps {
  courier: CourierProfile;
  custodyBalance: number;
  activeOrders: CourierOrder[];
  shifts: CourierShift[];
  loadingShifts?: boolean;
  activeCheckedInShift: CourierShift | null;
  nextEligibleShift: CourierShift | null;
  gpsError: string | null;
  lastGpsSync: string | null;
  onToggleAvailability: () => Promise<void>;
  onEndShift: () => Promise<void>;
  onAcceptOrder: (order: CourierOrder) => Promise<void>;
  onRejectOrder: (order: CourierOrder) => Promise<void>;
  onAdvanceOrderStatus: (order: CourierOrder, nextStatus: OrderStatus) => Promise<void>;
  onRequestDeliveryProof: (order: CourierOrder) => void;
  onRequestCancel: (order: CourierOrder) => void;
  onOpenDeposit: () => void;
  onOpenOrdersTab: () => void;
  onOpenShiftsTab: () => void;
  onStartCheckIn: (shift: CourierShift) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  courier,
  custodyBalance,
  activeOrders,
  shifts,
  loadingShifts = false,
  activeCheckedInShift,
  nextEligibleShift,
  gpsError,
  lastGpsSync,
  onToggleAvailability,
  onEndShift,
  onAcceptOrder,
  onRejectOrder,
  onAdvanceOrderStatus,
  onRequestDeliveryProof,
  onRequestCancel,
  onOpenDeposit,
  onOpenOrdersTab,
  onOpenShiftsTab,
  onStartCheckIn,
}) => {
  const [toggling, setToggling] = useState(false);
  const [endingShift, setEndingShift] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const intervalMs = activeCheckedInShift ? 1000 : 15000;
    const id = window.setInterval(() => {
      setNowTick(Date.now());
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [activeCheckedInShift]);

  const safeCustody = Number.isFinite(Number(custodyBalance)) ? Number(custodyBalance) : 0;
  const safeActiveOrders = Array.isArray(activeOrders) ? activeOrders : [];
  const isLocked = safeCustody >= CASH_LOCK_LIMIT_EGP;
  const isOnline = courier?.status === 'online' && !isLocked;

  const isForcedOnline = courier?.forceOnline === true;
  const shiftGate = evaluateShiftAvailabilityWindow(shifts, new Date(nowTick), {
    forceOnline: isForcedOnline,
  });
  const isCheckingShifts = !isForcedOnline && loadingShifts && shifts.length === 0;
  const isBlockedByShift = !isOnline && (isCheckingShifts || !shiftGate.canGoOnline);
  const toggleDisabled = toggling || isLocked || isBlockedByShift;

  const custodyPercent = Math.min(
    100,
    Math.round((safeCustody / CASH_LOCK_LIMIT_EGP) * 100)
  );
  const displayedOrders = safeActiveOrders.slice(0, 2);

  const shiftElapsedMs =
    activeCheckedInShift?.checkInTime
      ? nowTick - new Date(activeCheckedInShift.checkInTime).getTime()
      : 0;

  const nextEligibility = nextEligibleShift
    ? getCheckInEligibility(nextEligibleShift, new Date(nowTick))
    : null;

  const handleToggle = async () => {
    if (toggleDisabled) return;
    setToggling(true);
    try {
      await onToggleAvailability();
    } finally {
      setToggling(false);
    }
  };

  const handleEndShiftClick = async () => {
    if (endingShift) return;
    setEndingShift(true);
    try {
      await onEndShift();
    } finally {
      setEndingShift(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Account Cash Limit Lock Gate */}
      {isLocked && (
        <section
          role="alert"
          className="rounded-3xl bg-[#0A192F] text-white p-5 sm:p-6 border border-[#FF7B00]/50 space-y-4"
        >
          <div className="flex items-start gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FF7B00]/20 text-[#FF7B00]">
              <Lock className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-white">
                يجب توريد المبلغ لفتح الحساب
              </h2>
              <p className="mt-1 text-sm text-slate-300 leading-relaxed">
                وصلت عهدتك النقدية إلى{' '}
                <strong className="text-[#FF7B00] tabular-nums">
                  {formatEGP(safeCustody)} ج.م
                </strong>{' '}
                (الحد الأقصى {formatEGP(CASH_LOCK_LIMIT_EGP)} ج.م). قم بتسجيل توريد وإرفاق الإيصال لإعادة تفعيل استقبال الطلبات.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenDeposit}
            className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-[#FF7B00] px-4 py-3 text-sm font-extrabold text-white hover:bg-[#E56E00] active:scale-[0.99] transition-all cursor-pointer"
          >
            <Wallet className="h-4 w-4" />
            <span>تسجيل توريد الآن</span>
          </button>
        </section>
      )}

      {/* Top Grid: Status Switch + Shift Timer & Cash Balance */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Big Availability Switch + Shift Gate Card */}
        <section className="lg:col-span-7 rounded-3xl bg-white border border-slate-200 p-5 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-500">حالة الاتصال بالعمل</p>
              <h2 className="mt-1 text-xl font-extrabold text-[#0A192F]">
                {isLocked
                  ? 'الحساب مقفل مؤقتاً'
                  : isOnline
                    ? 'متاح للعمل'
                    : 'غير متاح'}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {isLocked
                  ? 'قم بتوريد العهدة لإعادة التفعيل'
                  : isOnline
                    ? 'يتم مشاركة موقعك المباشر كل 30 ثانية لاستقبال الطلبات'
                    : isCheckingShifts
                      ? 'جاري التحقق من موعد ورديتك لليوم...'
                      : shiftGate.canGoOnline
                        ? 'فعّل الزر لبدء استقبال طلبات التوصيل القريبة منك'
                        : 'الحساب بانتظار استيفاء شروط بدء العمل'}
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={isOnline}
              aria-label={isOnline ? 'تحويل إلى غير متاح' : 'تحويل إلى متاح للعمل'}
              disabled={toggleDisabled}
              onClick={() => void handleToggle()}
              className={`relative min-h-[56px] min-w-[104px] rounded-2xl px-3 flex items-center justify-between transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0 ${
                isOnline
                  ? 'bg-[#FF7B00] text-white'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              <Power className="h-5 w-5 shrink-0" />
              <span className="text-sm font-extrabold whitespace-nowrap">
                {toggling ? '...' : isOnline ? 'متصل' : 'متوقف'}
              </span>
            </button>
          </div>

          {/* Admin Force Online Notice */}
          {!isLocked && isForcedOnline && (
            <div
              role="status"
              className="rounded-2xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 flex items-center gap-2 text-xs font-extrabold text-emerald-900"
            >
              <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>تم تفعيل حسابك بواسطة الإدارة.</span>
            </div>
          )}

          {/* Shift Time & Selfie Gate Notice */}
          {!isLocked && !isCheckingShifts && !isForcedOnline && !shiftGate.canGoOnline && shiftGate.message && (
            <div
              role="status"
              className="rounded-2xl bg-amber-50 border border-amber-200 px-3.5 py-3 space-y-2.5"
            >
              <div className="flex items-start gap-2 text-xs font-extrabold text-amber-900">
                <Clock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p>{shiftGate.message}</p>
                  {shiftGate.detailMessage && (
                    <p className="text-[11px] font-semibold text-amber-800">
                      {shiftGate.detailMessage}
                    </p>
                  )}
                </div>
              </div>

              {shiftGate.needsSelfieCheckIn && shiftGate.todayShift && (
                <button
                  type="button"
                  onClick={() => onStartCheckIn(shiftGate.todayShift!)}
                  className="w-full min-h-[46px] flex items-center justify-center gap-2 rounded-xl bg-[#0A192F] px-4 py-2.5 text-xs sm:text-sm font-extrabold text-white hover:bg-[#13294B] active:scale-[0.99] transition-all cursor-pointer"
                >
                  <Camera className="h-4 w-4 text-[#FF7B00] shrink-0" />
                  <span>تصوير الزي وبدء الشيفت</span>
                </button>
              )}
            </div>
          )}

          {/* Shift Duration Timer OR Check-in Prompt */}
          {activeCheckedInShift ? (
            <div className="rounded-2xl bg-[#F6F8FB] border border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0A192F] text-[#FF7B00]">
                  <Timer className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-slate-500">
                    مدة الشيفت الحالية
                    {activeCheckedInShift.status === 'late' && (
                      <span className="text-amber-700 font-extrabold">
                        {' '}
                        · متأخر ({activeCheckedInShift.lateMinutes} د)
                      </span>
                    )}
                  </p>
                  <p className="text-base font-extrabold text-[#0A192F] tabular-nums" dir="ltr">
                    {formatDurationHMS(shiftElapsedMs)}
                  </p>
                </div>
              </div>

              <div className="text-left text-xs text-slate-500 tabular-nums">
                ينتهي الساعة {formatShiftTimeArabic(activeCheckedInShift.endDateTime)}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-[#F6F8FB] border border-slate-200 p-3.5 space-y-2.5">
              {nextEligibleShift && nextEligibility ? (
                <>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-[#0A192F]">
                      الشيفت القادم: {formatShiftTimeArabic(nextEligibleShift.startDateTime)} —{' '}
                      {formatShiftTimeArabic(nextEligibleShift.endDateTime)}
                    </span>
                    <button
                      type="button"
                      onClick={onOpenShiftsTab}
                      className="font-bold text-[#FF7B00] hover:underline cursor-pointer whitespace-nowrap"
                    >
                      عرض الورديات
                    </button>
                  </div>

                  {nextEligibility.isTooEarly ? (
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-800">
                      <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                      <span>لا يمكنك بدء العمل قبل موعد ورديتك المحدد.</span>
                    </div>
                  ) : !shiftGate.needsSelfieCheckIn ? (
                    <button
                      type="button"
                      disabled={!nextEligibility.canCheckIn}
                      onClick={() => onStartCheckIn(nextEligibleShift)}
                      className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-[#0A192F] px-4 py-2.5 text-xs sm:text-sm font-extrabold text-white hover:bg-[#13294B] disabled:opacity-50 cursor-pointer"
                    >
                      <Camera className="h-4 w-4 text-[#FF7B00]" />
                      <span>تصوير الزي وبدء الشيفت</span>
                    </button>
                  ) : null}
                </>
              ) : (
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 text-slate-600">
                    <CalendarClock className="h-4 w-4 text-slate-400 shrink-0" />
                    <span>لا توجد وردية مجدولة متاحة للتسجيل الآن</span>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenShiftsTab}
                    className="font-bold text-[#FF7B00] hover:underline cursor-pointer whitespace-nowrap"
                  >
                    جدول الورديات
                  </button>
                </div>
              )}
            </div>
          )}

          {/* End Shift Button when courier is online */}
          {isOnline && (
            <button
              type="button"
              onClick={() => void handleEndShiftClick()}
              disabled={endingShift}
              className="w-full min-h-[46px] flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50/70 px-4 py-2.5 text-sm font-extrabold text-red-700 hover:bg-red-100/80 active:scale-[0.99] disabled:opacity-60 transition-all cursor-pointer"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span>{endingShift ? 'جاري إنهاء الشيفت...' : 'إنهاء الشيفت'}</span>
            </button>
          )}

          {/* Live GPS telemetry line */}
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-slate-600">
              <MapPin
                className={`h-3.5 w-3.5 shrink-0 ${
                  isOnline && !gpsError ? 'text-emerald-600' : 'text-slate-400'
                }`}
              />
              {gpsError ? (
                <span className="text-red-600 font-semibold">{gpsError}</span>
              ) : isOnline &&
                typeof courier.currentLat === 'number' &&
                Number.isFinite(courier.currentLat) &&
                typeof courier.currentLng === 'number' &&
                Number.isFinite(courier.currentLng) ? (
                <span className="tabular-nums">
                  GPS نشط · {courier.currentLat.toFixed(4)}, {courier.currentLng.toFixed(4)}
                </span>
              ) : (
                <span>تتبع الموقع متوقف حالياً</span>
              )}
            </div>
            {lastGpsSync && isOnline && (
              <span className="text-slate-400 tabular-nums">آخر تحديث: {lastGpsSync}</span>
            )}
          </div>
        </section>

        {/* Cash Custody Card */}
        <section className="lg:col-span-5 rounded-3xl bg-[#0A192F] text-white p-5 flex flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-slate-300">العهدة النقدية الحالية</p>
              <p className="mt-1.5 text-3xl font-extrabold tracking-tight tabular-nums">
                {formatEGP(safeCustody)}{' '}
                <span className="text-sm font-bold text-[#FF7B00]">ج.م</span>
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenDeposit}
              className="min-h-[40px] rounded-xl bg-white/10 hover:bg-white/20 px-3 py-2 text-xs font-bold text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              تسجيل توريد
            </button>
          </div>

          <div>
            <div className="flex items-center justify-between text-[11px] text-slate-300 mb-1.5">
              <span>الحد المسموح قبل التوريد</span>
              <span className="tabular-nums font-bold">
                {formatEGP(CASH_LOCK_LIMIT_EGP)} ج.م ({custodyPercent}%)
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-white/15 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isLocked ? 'bg-red-500' : 'bg-[#FF7B00]'
                }`}
                style={{width: `${custodyPercent}%`}}
              />
            </div>
          </div>
        </section>
      </div>

      {/* Active Orders (max 2) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-extrabold text-[#0A192F]">
              الطلبات النشطة ({displayedOrders.length})
            </h3>
            <p className="text-xs text-slate-500">
              الحد الأقصى للطلبات النشطة المتزامنة هو طلبان
            </p>
          </div>
          {activeOrders.length > 0 && (
            <button
              type="button"
              onClick={onOpenOrdersTab}
              className="min-h-[40px] px-3 text-xs font-bold text-[#FF7B00] hover:underline cursor-pointer whitespace-nowrap"
            >
              كل الطلبات
            </button>
          )}
        </div>

        {displayedOrders.length === 0 ? (
          <div className="rounded-3xl bg-white border border-slate-200 p-8 text-center space-y-2.5">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F6F8FB] text-[#0A192F]">
              <PackageCheck className="h-7 w-7 text-[#FF7B00]" />
            </div>
            <h4 className="text-base font-extrabold text-[#0A192F]">
              لا توجد طلبات نشطة حالياً
            </h4>
            <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
              {isOnline
                ? 'أنت متصل الآن، ستظهر هنا الطلبات المعينة لك فور إسنادها.'
                : 'قم بتفعيل حالة «متاح للعمل» من الأعلى لاستقبال طلبات التوصيل.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {displayedOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                courierLat={courier.currentLat}
                courierLng={courier.currentLng}
                isAccountLocked={isLocked}
                onAcceptOrder={onAcceptOrder}
                onRejectOrder={onRejectOrder}
                onAdvanceStatus={onAdvanceOrderStatus}
                onRequestDeliveryProof={onRequestDeliveryProof}
                onRequestCancel={onRequestCancel}
                defaultMapExpanded={false}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
