import React, {useMemo, useState} from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  LogOut,
  PackageCheck,
  Wifi,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react';
import {
  buildWeeklyScheduleDays,
  formatMinutesArabic,
  formatShortDateArabic,
  formatTimeFromIsoArabic,
  getCheckInEligibility,
  getWeekDaysStartingSaturday,
  type WeeklyDaySchedule,
} from '../lib/supabase';
import type {
  CourierAvailability,
  CourierOrder,
  CourierShift,
  ShiftStatusEvent,
} from '../types/hatly';

interface ShiftsViewProps {
  shifts: CourierShift[];
  orders: CourierOrder[];
  statusEvents: ShiftStatusEvent[];
  courierStatus: CourierAvailability;
  onStartCheckIn: (shift: CourierShift) => void;
  onEndShift: () => Promise<void>;
}

function getDayStatusSummary(day: WeeklyDaySchedule): {
  label: string;
  colorClass: string;
  icon: React.ReactNode;
} {
  if (!day.shift) {
    return {
      label: 'يوم راحة',
      colorClass: 'text-slate-400',
      icon: null,
    };
  }

  switch (day.shift.status) {
    case 'active':
      return {
        label: 'نشط الآن',
        colorClass: 'text-emerald-700',
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />,
      };
    case 'late':
      return {
        label:
          day.shift.lateMinutes > 0
            ? `متأخر (${day.shift.lateMinutes} د)`
            : 'متأخر',
        colorClass: 'text-amber-700',
        icon: <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />,
      };
    case 'completed':
      return {
        label: 'مكتمل',
        colorClass: 'text-[#0A192F]',
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />,
      };
    case 'missed':
      return {
        label: 'غياب',
        colorClass: 'text-red-600',
        icon: <XCircle className="h-4 w-4 text-red-600 shrink-0" />,
      };
    case 'cancelled':
      return {
        label: 'ملغي',
        colorClass: 'text-slate-400',
        icon: <XCircle className="h-4 w-4 text-slate-400 shrink-0" />,
      };
    default:
      return {
        label: day.isPast ? 'غير مسجل' : 'مجدول',
        colorClass: 'text-slate-600',
        icon: <Clock className="h-4 w-4 text-slate-500 shrink-0" />,
      };
  }
}

export const ShiftsView: React.FC<ShiftsViewProps> = ({
  shifts,
  orders,
  statusEvents,
  courierStatus,
  onStartCheckIn,
  onEndShift,
}) => {
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [endingShift, setEndingShift] = useState(false);

  const now = new Date();

  const weekDays = useMemo(
    () => getWeekDaysStartingSaturday(now, weekOffset),
    // Recompute on weekOffset or day key boundary
    [weekOffset, now.getFullYear(), now.getMonth(), now.getDate()]
  );

  const scheduleDays = useMemo(
    () =>
      buildWeeklyScheduleDays({
        weekDays,
        shifts,
        orders,
        events: statusEvents,
        courierStatus,
        now,
      }),
    [weekDays, shifts, orders, statusEvents, courierStatus, now.getMinutes()]
  );

  const selectedDay = useMemo(
    () =>
      selectedDateKey
        ? scheduleDays.find((d) => d.dateKey === selectedDateKey) ?? null
        : null,
    [scheduleDays, selectedDateKey]
  );

  const weeklyTotals = useMemo(() => {
    const scheduledCount = scheduleDays.filter((d) => Boolean(d.shift)).length;
    const deliveredCount = scheduleDays.reduce(
      (sum, d) => sum + d.deliveredOrdersCount,
      0
    );
    const totalOfflineMinutes = scheduleDays.reduce(
      (sum, d) => sum + d.offlineMinutes,
      0
    );
    return {scheduledCount, deliveredCount, totalOfflineMinutes};
  }, [scheduleDays]);

  const weekRangeLabel = useMemo(() => {
    if (weekDays.length < 7) return '';
    return `${formatShortDateArabic(weekDays[0])} — ${formatShortDateArabic(
      weekDays[6]
    )}`;
  }, [weekDays]);

  const handleEndShiftAction = async () => {
    if (endingShift) return;
    setEndingShift(true);
    try {
      await onEndShift();
    } finally {
      setEndingShift(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header + Week Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-[#0A192F]">وردياتي</h2>
          <p className="text-xs text-slate-500">
            جدول الأسبوع التفصيلي وسجل الحضور والانصراف وساعات العمل
          </p>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 bg-white border border-slate-200 rounded-2xl p-1.5">
          <button
            type="button"
            onClick={() => setWeekOffset((prev) => prev - 1)}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="الأسبوع السابق"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <div className="px-2 text-center">
            <p className="text-xs font-extrabold text-[#0A192F]">
              {weekOffset === 0
                ? 'الأسبوع الحالي'
                : weekOffset < 0
                  ? `قبل ${Math.abs(weekOffset)} أسبوع`
                  : `بعد ${weekOffset} أسبوع`}
            </p>
            <p className="text-[11px] text-slate-500 tabular-nums">
              {weekRangeLabel}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setWeekOffset((prev) => prev + 1)}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="الأسبوع القادم"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      </div>

      {weekOffset !== 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setWeekOffset(0)}
            className="min-h-[36px] px-3 text-xs font-bold text-[#FF7B00] hover:underline cursor-pointer"
          >
            العودة إلى الأسبوع الحالي
          </button>
        </div>
      )}

      {/* Compact Weekly Summary Strip */}
      <section className="grid grid-cols-3 gap-2.5 sm:gap-3">
        <div className="rounded-2xl bg-[#0A192F] text-white p-3.5 sm:p-4">
          <p className="text-[11px] font-semibold text-slate-300">
            ورديات الأسبوع
          </p>
          <p className="mt-1 text-xl sm:text-2xl font-extrabold tabular-nums">
            {weeklyTotals.scheduledCount}{' '}
            <span className="text-xs font-bold text-[#FF7B00]">أيام</span>
          </p>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-3.5 sm:p-4">
          <p className="text-[11px] font-semibold text-slate-500">
            الطلبات المسلمة
          </p>
          <p className="mt-1 text-xl sm:text-2xl font-extrabold text-[#0A192F] tabular-nums">
            {weeklyTotals.deliveredCount}{' '}
            <span className="text-xs font-bold text-slate-500">طلب</span>
          </p>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-3.5 sm:p-4">
          <p className="text-[11px] font-semibold text-slate-500">
            وقت غير متصل
          </p>
          <p
            className={`mt-1 text-base sm:text-xl font-extrabold tabular-nums ${
              weeklyTotals.totalOfflineMinutes > 0
                ? 'text-amber-700'
                : 'text-emerald-700'
            }`}
          >
            {formatMinutesArabic(weeklyTotals.totalOfflineMinutes)}
          </p>
        </div>
      </section>

      {/* 7-Day Weekly Schedule List */}
      <section
        aria-label="جدول الأسبوع"
        className="rounded-3xl bg-white border border-slate-200 overflow-hidden divide-y divide-slate-100"
      >
        {scheduleDays.map((day) => {
          const statusMeta = getDayStatusSummary(day);
          const eligibility = day.shift
            ? getCheckInEligibility(day.shift, now)
            : null;
          const showQuickCheckIn =
            day.isToday &&
            day.shift &&
            !day.checkInTime &&
            day.shift.status === 'scheduled' &&
            Boolean(eligibility?.canCheckIn);

          const hasAttendanceTimes =
            Boolean(day.checkInTime) || Boolean(day.checkOutTime);

          return (
            <div
              key={day.dateKey}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedDateKey(day.dateKey)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedDateKey(day.dateKey);
                }
              }}
              className={`w-full text-right p-4 sm:px-5 sm:py-4 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#FF7B00] ${
                day.isToday
                  ? 'bg-[#FF7B00]/6 hover:bg-[#FF7B00]/10'
                  : 'hover:bg-[#F6F8FB]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                {/* Right Side: Day name, date, scheduled time & check-in/out */}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-extrabold text-[#0A192F]">
                      {day.dayName}
                    </span>
                    {day.isToday && (
                      <span className="text-xs font-extrabold text-[#FF7B00]">
                        · اليوم
                      </span>
                    )}
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="text-xs font-semibold text-slate-500 tabular-nums">
                      {day.shortDate}
                    </span>
                  </div>

                  {/* Scheduled shift time */}
                  <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#0A192F] tabular-nums">
                    <CalendarDays className="h-3.5 w-3.5 text-[#FF7B00] shrink-0" />
                    <span>{day.scheduledTimeLabel}</span>
                  </div>

                  {/* Actual Check-in and Check-out for past days or recorded shifts */}
                  {(day.isPast || hasAttendanceTimes) && day.shift && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 tabular-nums">
                      <span>
                        الحضور:{' '}
                        <strong className="text-[#0A192F]">
                          {formatTimeFromIsoArabic(day.checkInTime)}
                        </strong>
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span>
                        الانصراف:{' '}
                        <strong className="text-[#0A192F]">
                          {day.checkOutTime
                            ? formatTimeFromIsoArabic(day.checkOutTime)
                            : day.isToday && day.checkInTime
                              ? 'قيد العمل'
                              : '—'}
                        </strong>
                      </span>
                    </div>
                  )}

                  {/* Offline duration inline indicator if > 0 */}
                  {day.shift && day.offlineMinutes > 0 && (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 tabular-nums">
                      <WifiOff className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                      <span>
                        وقت غير متصل: {formatMinutesArabic(day.offlineMinutes)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Left Side: Status label + Chevron */}
                <div className="flex flex-col items-end justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-1.5">
                    {statusMeta.icon}
                    <span className={`text-xs font-extrabold ${statusMeta.colorClass}`}>
                      {statusMeta.label}
                    </span>
                    <ChevronLeft className="h-4 w-4 text-slate-400" />
                  </div>

                  {day.deliveredOrdersCount > 0 && (
                    <span className="text-[11px] font-bold text-slate-500 tabular-nums">
                      {day.deliveredOrdersCount} طلبات مسلمة
                    </span>
                  )}
                </div>
              </div>

              {/* Direct Start Shift action on Today's row when eligible */}
              {showQuickCheckIn && day.shift && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartCheckIn(day.shift as CourierShift);
                    }}
                    className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-[#FF7B00] px-4 py-2.5 text-xs sm:text-sm font-extrabold text-white hover:bg-[#E56E00] transition-colors cursor-pointer"
                  >
                    <Camera className="h-4 w-4 shrink-0" />
                    <span>بدء الشيفت الآن</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Day Details Modal / Bottom Sheet */}
      {selectedDay && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="day-details-title"
          onClick={() => setSelectedDateKey(null)}
        >
          <div
            className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white border border-slate-200 shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sm:hidden w-10 h-1.5 bg-slate-300 rounded-full mx-auto mt-3" />

            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-100">
              <div>
                <h3
                  id="day-details-title"
                  className="text-lg font-extrabold text-[#0A192F]"
                >
                  {selectedDay.dayName} · {selectedDay.shortDate}
                </h3>
                <p className="mt-0.5 text-xs font-semibold text-slate-500 tabular-nums">
                  {selectedDay.scheduledTimeLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDateKey(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer shrink-0"
                aria-label="إغلاق"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Current / Final Connectivity Status */}
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#F6F8FB] border border-slate-200 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  {selectedDay.currentOrFinalStatus === 'online' ? (
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                      <Wifi className="h-4 w-4" />
                    </div>
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-200 text-slate-600">
                      <WifiOff className="h-4 w-4" />
                    </div>
                  )}
                  <div>
                    <p className="text-[11px] font-semibold text-slate-500">
                      حالة الاتصال
                    </p>
                    <p
                      className={`text-sm font-extrabold ${
                        selectedDay.currentOrFinalStatus === 'online'
                          ? 'text-emerald-700'
                          : 'text-[#0A192F]'
                      }`}
                    >
                      {selectedDay.currentOrFinalStatus === 'online'
                        ? 'متصل'
                        : 'غير متصل'}
                    </p>
                  </div>
                </div>

                {selectedDay.shift?.checkInPhotoUrl && (
                  <a
                    href={selectedDay.shift.checkInPhotoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-white border border-slate-200 px-3 py-1.5 text-xs font-bold text-[#FF7B00] hover:bg-slate-50"
                  >
                    <span>صورة الحضور</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>

              {/* 4 Key Shift Metrics Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white border border-slate-200 p-3.5">
                  <p className="text-[11px] font-semibold text-slate-500">
                    وقت تسجيل الحضور
                  </p>
                  <p className="mt-1 text-base font-extrabold text-[#0A192F] tabular-nums">
                    {formatTimeFromIsoArabic(selectedDay.checkInTime)}
                  </p>
                </div>

                <div className="rounded-2xl bg-white border border-slate-200 p-3.5">
                  <p className="text-[11px] font-semibold text-slate-500">
                    وقت تسجيل الانصراف
                  </p>
                  <p className="mt-1 text-base font-extrabold text-[#0A192F] tabular-nums">
                    {selectedDay.checkOutTime
                      ? formatTimeFromIsoArabic(selectedDay.checkOutTime)
                      : selectedDay.isToday && selectedDay.checkInTime
                        ? 'نشط الآن'
                        : '—'}
                  </p>
                </div>

                <div className="rounded-2xl bg-white border border-slate-200 p-3.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                    <PackageCheck className="h-3.5 w-3.5 text-[#FF7B00]" />
                    <span>الطلبات المسلمة بالشيفت</span>
                  </div>
                  <p className="mt-1 text-base font-extrabold text-[#0A192F] tabular-nums">
                    {selectedDay.deliveredOrdersCount} طلب
                  </p>
                </div>

                <div className="rounded-2xl bg-white border border-slate-200 p-3.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                    <Clock className="h-3.5 w-3.5 text-amber-600" />
                    <span>إجمالي وقت عدم الاتصال</span>
                  </div>
                  <p
                    className={`mt-1 text-base font-extrabold tabular-nums ${
                      selectedDay.offlineMinutes > 0
                        ? 'text-amber-700'
                        : 'text-emerald-700'
                    }`}
                  >
                    {selectedDay.offlineMinutes} دقيقة
                    {selectedDay.offlineMinutes >= 60
                      ? ` (${formatMinutesArabic(selectedDay.offlineMinutes)})`
                      : ''}
                  </p>
                </div>
              </div>

              {/* Status & Attendance Timestamps Log */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-extrabold text-[#0A192F]">
                  سجل الحالة والأوقات (متصل / غير متصل)
                </h4>

                {selectedDay.timeline.length === 0 ? (
                  <div className="rounded-2xl bg-[#F6F8FB] border border-slate-200 p-4 text-center text-xs text-slate-500">
                    {selectedDay.shift
                      ? 'لا توجد أحداث اتصال أو حضور مسجلة لهذا اليوم بعد.'
                      : 'لا توجد وردية مجدولة أو نشاط مسجل في هذا اليوم.'}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                    {selectedDay.timeline.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between gap-3 px-4 py-3 text-xs bg-white"
                      >
                        <div className="flex items-center gap-2.5">
                          {entry.status === 'online' ? (
                            <Wifi className="h-4 w-4 text-emerald-600 shrink-0" />
                          ) : (
                            <WifiOff className="h-4 w-4 text-slate-500 shrink-0" />
                          )}
                          <span className="font-bold text-[#0A192F]">
                            {entry.label}
                          </span>
                        </div>
                        <span className="font-bold text-slate-600 tabular-nums">
                          {formatTimeFromIsoArabic(entry.timestamp)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Modal Actions for Today's Shift */}
              {selectedDay.isToday && selectedDay.shift && (
                <div className="pt-1 space-y-2">
                  {!selectedDay.checkInTime &&
                    selectedDay.shift.status === 'scheduled' &&
                    getCheckInEligibility(selectedDay.shift, now).canCheckIn && (
                      <button
                        type="button"
                        onClick={() => {
                          const targetShift = selectedDay.shift as CourierShift;
                          setSelectedDateKey(null);
                          onStartCheckIn(targetShift);
                        }}
                        className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-[#FF7B00] px-4 py-3 text-sm font-extrabold text-white hover:bg-[#E56E00] cursor-pointer"
                      >
                        <Camera className="h-4 w-4 shrink-0" />
                        <span>بدء الشيفت الآن</span>
                      </button>
                    )}

                  {courierStatus === 'online' && !selectedDay.checkOutTime && (
                    <button
                      type="button"
                      disabled={endingShift}
                      onClick={() => void handleEndShiftAction()}
                      className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-extrabold text-red-700 hover:bg-red-100 disabled:opacity-60 cursor-pointer"
                    >
                      <LogOut className="h-4 w-4 shrink-0" />
                      <span>
                        {endingShift ? 'جاري إنهاء الشيفت...' : 'إنهاء الشيفت'}
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
