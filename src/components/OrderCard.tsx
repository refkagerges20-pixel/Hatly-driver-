import React, {lazy, Suspense, useState} from 'react';
import {
  Banknote,
  Bike,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  ExternalLink,
  Eye,
  Loader2,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Receipt,
  Truck,
  X,
  XCircle,
} from 'lucide-react';
import {formatDateArabic, formatEGP} from '../lib/supabase';
import type {CourierOrder, OrderStatus} from '../types/hatly';
import type {CourierMapMode} from './CourierMap';

const LazyCourierMap = lazy(() =>
  import('./CourierMap').then((mod) => ({default: mod.CourierMap}))
);

function formatEgyptianWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('20')) return digits;
  if (digits.startsWith('0')) return `2${digits}`;
  return `20${digits}`;
}

interface OrderCardProps {
  order: CourierOrder;
  courierLat: number | null;
  courierLng: number | null;
  isAccountLocked: boolean;
  onAcceptOrder: (order: CourierOrder) => Promise<void>;
  onRejectOrder: (order: CourierOrder) => Promise<void>;
  onAdvanceStatus: (order: CourierOrder, nextStatus: OrderStatus) => Promise<void>;
  onRequestDeliveryProof?: (order: CourierOrder) => void;
  onRequestCancel?: (order: CourierOrder) => void;
  defaultMapExpanded?: boolean;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  assigned: 'بانتظار الموافقة',
  confirmed_by_courier: 'تمت الموافقة · التوجه للاستلام',
  accepted: 'تمت الموافقة · التوجه للاستلام',
  on_the_way_to_pickup: 'في الطريق للاستلام',
  picked_up: 'تم الاستلام من التاجر',
  on_the_way: 'في الطريق للعميل',
  delivered: 'تم التسليم',
  cancelled: 'ملغي',
};

export const OrderCard: React.FC<OrderCardProps> = ({
  order,
  courierLat,
  courierLng,
  isAccountLocked,
  onAcceptOrder,
  onRejectOrder,
  onAdvanceStatus,
  onRequestDeliveryProof,
  onRequestCancel,
  defaultMapExpanded = false,
}) => {
  const [updating, setUpdating] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState<'accept' | 'reject' | null>(null);
  const [mapOpen, setMapOpen] = useState(defaultMapExpanded);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [proofLightboxOpen, setProofLightboxOpen] = useState(false);

  const isPendingAssignment = order.status === 'assigned';
  const isConfirmedForPickup =
    order.status === 'confirmed_by_courier' || order.status === 'accepted';
  const isOnWayToPickup = order.status === 'on_the_way_to_pickup';
  const isPickupStage = isPendingAssignment || isConfirmedForPickup || isOnWayToPickup;
  const isDeliveryStage = order.status === 'picked_up' || order.status === 'on_the_way';
  const isCompleted = order.status === 'delivered' || order.status === 'cancelled';

  const nextAction: {
    status: OrderStatus;
    label: string;
    icon: React.ReactNode;
    btnClass: string;
  } | null = isConfirmedForPickup
    ? {
        status: 'on_the_way_to_pickup',
        label: 'في الطريق للاستلام',
        icon: <Bike className="h-5 w-5 shrink-0" />,
        btnClass: 'bg-[#FF7B00] hover:bg-[#E56E00] text-white',
      }
    : isOnWayToPickup
      ? {
          status: 'picked_up',
          label: 'تم الاستلام من التاجر',
          icon: <Package className="h-5 w-5 shrink-0" />,
          btnClass: 'bg-[#0A192F] hover:bg-[#13294B] text-white',
        }
      : order.status === 'picked_up'
        ? {
            status: 'on_the_way',
            label: 'في الطريق للعميل',
            icon: <Truck className="h-5 w-5 shrink-0" />,
            btnClass: 'bg-[#FF7B00] hover:bg-[#E56E00] text-white',
          }
        : order.status === 'on_the_way'
          ? {
              status: 'delivered',
              label: 'تم التسليم',
              icon: <CheckCircle2 className="h-5 w-5 shrink-0" />,
              btnClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
            }
          : null;

  const handleAction = async () => {
    if (!nextAction || updating || isAccountLocked) return;
    if (nextAction.status === 'delivered' && onRequestDeliveryProof) {
      setDetailsOpen(false);
      onRequestDeliveryProof(order);
      return;
    }
    setUpdating(true);
    try {
      await onAdvanceStatus(order, nextAction.status);
    } finally {
      setUpdating(false);
    }
  };

  const handleAccept = async () => {
    if (decisionBusy || isAccountLocked) return;
    setDecisionBusy('accept');
    try {
      await onAcceptOrder(order);
    } finally {
      setDecisionBusy(null);
    }
  };

  const handleReject = async () => {
    if (decisionBusy) return;
    setDecisionBusy('reject');
    try {
      setDetailsOpen(false);
      await onRejectOrder(order);
    } finally {
      setDecisionBusy(null);
    }
  };

  const mapMode: CourierMapMode = isPickupStage ? 'pickup' : 'delivery';
  const stageMessage = isPickupStage
    ? `أنت في الطريق لاستلام الطلب من ${order.pickupName}`
    : isDeliveryStage
      ? 'أنت في الطريق لتسليم الطلب للعميل'
      : '';

  const canCancelDelivery = isDeliveryStage && Boolean(onRequestCancel);
  const rawCustomerPhone = (order.customerPhone ?? '').trim();
  const whatsAppNumber = formatEgyptianWhatsAppNumber(rawCustomerPhone);
  const showCustomerContactButtons = isDeliveryStage && Boolean(rawCustomerPhone);
  const whatsAppHref = whatsAppNumber
    ? `https://wa.me/${whatsAppNumber}?text=${encodeURIComponent(
        'مرحباً، أنا مندوب هاتلي، وصلت لطلبك.'
      )}`
    : '';

  const paymentMethodNormalized = String(order.paymentMethod ?? '').trim().toLowerCase();
  const isCashPayment =
    paymentMethodNormalized === 'cash' ||
    paymentMethodNormalized === 'cod' ||
    paymentMethodNormalized === '';

  const deliveryProofPhotos = [
    order.deliveryPhoto1,
    order.deliveryPhoto2,
    order.deliveryPhoto3,
  ].filter((url): url is string => Boolean(url));

  const renderFinancialBreakdownCard = () => (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-[#0A192F] text-white">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-[#FF7B00] shrink-0" />
          <span className="text-xs sm:text-sm font-extrabold">تفاصيل الحساب</span>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-extrabold ${
            isCashPayment
              ? 'bg-[#FF7B00]/20 text-[#FF7B00]'
              : 'bg-emerald-500/20 text-emerald-300'
          }`}
        >
          {isCashPayment ? (
            <>
              <Banknote className="h-3.5 w-3.5 shrink-0" />
              <span>دفع نقدي</span>
            </>
          ) : (
            <>
              <CreditCard className="h-3.5 w-3.5 shrink-0" />
              <span>بطاقة بنكية</span>
            </>
          )}
        </span>
      </div>

      <div className="p-4 space-y-2.5">
        <div className="flex items-center justify-between text-xs sm:text-sm">
          <span className="font-semibold text-slate-600">قيمة الطلب</span>
          <span className="font-bold text-[#0A192F] tabular-nums">
            {formatEGP(order.productsAmount)} ج.م
          </span>
        </div>

        <div className="flex items-center justify-between text-xs sm:text-sm">
          <span className="font-semibold text-slate-600">رسوم التوصيل</span>
          <span className="font-bold text-[#0A192F] tabular-nums">
            {formatEGP(order.deliveryFeeNet)} ج.م
          </span>
        </div>

        <div className="pt-2.5 border-t border-slate-200 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs sm:text-sm font-extrabold text-[#0A192F]">
              الإجمالي المطلوب تحصيله
            </p>
            <p
              className={`mt-0.5 text-[11px] font-bold ${
                isCashPayment ? 'text-amber-700' : 'text-emerald-700'
              }`}
            >
              {isCashPayment
                ? 'المبلغ المطلوب تحصيله من العميل'
                : 'مدفوع مسبقاً بالبطاقة'}
            </p>
          </div>
          <p className="text-xl sm:text-2xl font-extrabold text-[#FF7B00] tabular-nums shrink-0">
            {formatEGP(order.totalAmount)}{' '}
            <span className="text-xs font-extrabold text-[#0A192F]">ج.م</span>
          </p>
        </div>
      </div>
    </div>
  );

  const renderPendingPrompt = () => {
    if (!isPendingAssignment) return null;
    return (
      <div className="rounded-2xl bg-[#FF7B00]/8 border border-[#FF7B00]/35 p-4 space-y-3">
        <p className="text-sm font-extrabold text-[#0A192F] text-center">
          هل أنت موافق على استلام هذا الطلب؟
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => void handleAccept()}
            disabled={decisionBusy !== null || isAccountLocked}
            className="min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-sm font-extrabold transition-colors active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <Check className="h-4 w-4 shrink-0" />
            <span>{decisionBusy === 'accept' ? 'جاري التأكيد...' : 'موافق'}</span>
          </button>

          <button
            type="button"
            onClick={() => void handleReject()}
            disabled={decisionBusy !== null}
            className="min-h-[48px] flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 px-4 py-2.5 text-sm font-extrabold transition-colors active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <X className="h-4 w-4 shrink-0" />
            <span>{decisionBusy === 'reject' ? 'جاري الرفض...' : 'لا أوافق'}</span>
          </button>
        </div>
      </div>
    );
  };

  const renderMapSection = (heightClass: string) => (
    <div className="space-y-2.5">
      {stageMessage && (
        <div className="flex items-center gap-2 rounded-xl bg-[#0A192F]/5 border border-slate-200 px-3.5 py-2.5 text-xs sm:text-sm font-extrabold text-[#0A192F]">
          {isPickupStage ? (
            <Package className="h-4 w-4 text-[#FF7B00] shrink-0" />
          ) : (
            <Truck className="h-4 w-4 text-[#FF7B00] shrink-0" />
          )}
          <span>{stageMessage}</span>
        </div>
      )}

      <div
        className={
          showCustomerContactButtons
            ? 'grid grid-cols-1 sm:grid-cols-12 gap-3 items-start'
            : 'space-y-2'
        }
      >
        <div className={showCustomerContactButtons ? 'sm:col-span-8' : 'w-full'}>
          <Suspense
            fallback={
              <div
                className={`w-full ${heightClass} rounded-2xl border border-slate-200 bg-[#F6F8FB] flex items-center justify-center gap-2 text-xs font-bold text-slate-500`}
              >
                <Loader2 className="h-4 w-4 animate-spin text-[#FF7B00]" />
                <span>جاري تحميل الخريطة...</span>
              </div>
            }
          >
            <LazyCourierMap
              mode={mapMode}
              pickupLat={order.pickupLat}
              pickupLng={order.pickupLng}
              pickupLabel={order.pickupAddress}
              deliveryLat={order.deliveryLat}
              deliveryLng={order.deliveryLng}
              deliveryLabel={order.deliveryAddress}
              courierLat={courierLat}
              courierLng={courierLng}
              heightClass={heightClass}
            />
          </Suspense>
        </div>

        {showCustomerContactButtons && (
          <div className="sm:col-span-4 flex flex-row sm:flex-col gap-2">
            <a
              href={`tel:${rawCustomerPhone}`}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-[#F6F8FB] px-3.5 py-2.5 text-sm font-extrabold text-[#0A192F] hover:bg-slate-100 transition-colors"
            >
              <Phone className="h-4 w-4 text-[#FF7B00] shrink-0" />
              <span>اتصال</span>
            </a>

            {whatsAppNumber && (
              <a
                href={whatsAppHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                aria-label="تواصل مع العميل عبر واتساب"
                className="flex-1 min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl border-2 border-emerald-500 bg-emerald-50 px-3.5 py-2.5 text-sm font-extrabold text-emerald-900 hover:bg-emerald-100 active:scale-[0.98] transition-all"
              >
                <MessageCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>واتساب</span>
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <article className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 space-y-4">
        {/* Header row: Order number + status metadata + amount */}
        <div
          role={!isCompleted ? 'button' : undefined}
          tabIndex={!isCompleted ? 0 : undefined}
          onClick={!isCompleted ? () => setDetailsOpen(true) : undefined}
          onKeyDown={
            !isCompleted
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setDetailsOpen(true);
                  }
                }
              : undefined
          }
          className={`flex items-start justify-between gap-3 pb-3 border-b border-slate-100 ${
            !isCompleted ? 'cursor-pointer' : ''
          }`}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-bold text-[#0A192F] tabular-nums" dir="ltr">
                #{order.orderNumber}
              </span>
              <span aria-hidden="true">·</span>
              <span
                className={`font-semibold ${
                  order.status === 'delivered'
                    ? 'text-emerald-700'
                    : order.status === 'cancelled'
                      ? 'text-red-600'
                      : 'text-[#FF7B00]'
                }`}
              >
                {STATUS_LABELS[order.status] ?? 'بانتظار الموافقة'}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400 tabular-nums">
              {formatDateArabic(order.createdAt)}
            </p>
          </div>

          <div className="text-left shrink-0">
            <p className="text-[11px] font-medium text-slate-500">
              {['cash', 'cod'].includes(String(order.paymentMethod ?? '').trim().toLowerCase())
                ? 'تحصيل نقدي'
                : 'دفع إلكتروني'}
            </p>
            <p className="text-lg font-extrabold text-[#0A192F] tabular-nums">
              {formatEGP(order.totalAmount)} <span className="text-xs font-bold">ج.م</span>
            </p>
          </div>
        </div>

        {/* Dynamic Map at the top of active order details */}
        {!isCompleted && mapOpen && renderMapSection('h-[250px]')}

        {/* Pickup & Delivery Route */}
        <div
          role={!isCompleted ? 'button' : undefined}
          tabIndex={!isCompleted ? 0 : undefined}
          onClick={!isCompleted ? () => setDetailsOpen(true) : undefined}
          onKeyDown={
            !isCompleted
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setDetailsOpen(true);
                  }
                }
              : undefined
          }
          className={`space-y-3 ${!isCompleted ? 'cursor-pointer' : ''}`}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#0A192F]/8 text-[#0A192F]">
              <Package className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-500">
                الاستلام · {order.pickupName}
              </p>
              <p className="mt-0.5 text-sm font-bold text-[#0A192F] leading-snug">
                {order.pickupAddress}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#FF7B00]/12 text-[#FF7B00]">
              <MapPin className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-500">
                التسليم · {order.customerName}
              </p>
              <p className="mt-0.5 text-sm font-bold text-[#0A192F] leading-snug">
                {order.deliveryAddress}
              </p>
            </div>
          </div>
        </div>

        {/* Notes if any */}
        {order.notes && (
          <p className="rounded-xl bg-[#F6F8FB] px-3.5 py-2.5 text-xs text-slate-600 leading-relaxed">
            ملاحظة: {order.notes}
          </p>
        )}

        {/* Financial Breakdown Card below customer details */}
        {renderFinancialBreakdownCard()}

        {/* Customer Phone + Map Toggle + Details Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {rawCustomerPhone ? (
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`tel:${rawCustomerPhone}`}
                className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-[#F6F8FB] px-3.5 py-2 text-sm font-bold text-[#0A192F] hover:bg-slate-100 transition-colors"
              >
                <Phone className="h-4 w-4 text-[#FF7B00] shrink-0" />
                <span>اتصال</span>
                <span className="tabular-nums text-xs text-slate-600" dir="ltr">
                  {rawCustomerPhone}
                </span>
              </a>

              {isDeliveryStage && whatsAppNumber && (
                <a
                  href={whatsAppHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="تواصل مع العميل عبر واتساب"
                  className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border-2 border-emerald-500 bg-emerald-50 px-3.5 py-2 text-sm font-extrabold text-emerald-900 hover:bg-emerald-100 active:scale-[0.98] transition-all"
                >
                  <MessageCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>واتساب</span>
                </a>
              )}
            </div>
          ) : (
            <span className="text-xs text-slate-400">رقم الهاتف غير مسجل</span>
          )}

          {!isCompleted && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDetailsOpen(true)}
                className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-[#0A192F] hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <span>التفاصيل</span>
              </button>

              <button
                type="button"
                onClick={() => setMapOpen((prev) => !prev)}
                className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-[#0A192F] hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <span>{mapOpen ? 'إخفاء الخريطة' : 'عرض الخريطة'}</span>
                {mapOpen ? (
                  <ChevronUp className="h-4 w-4 text-slate-500" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-500" />
                )}
              </button>
            </div>
          )}
        </div>

        {/* Cancellation Details when order is cancelled */}
        {order.status === 'cancelled' && (
          <div className="rounded-2xl bg-red-50/80 border border-red-200 p-3.5 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-extrabold text-red-700 flex items-center gap-1.5">
                  <XCircle className="h-4 w-4 shrink-0" />
                  <span>تفاصيل إلغاء التسليم</span>
                </p>
                <p className="text-xs sm:text-sm font-bold text-[#0A192F]">
                  السبب: {order.cancelReason || 'غير محدد'}
                </p>
                {order.cancelledAt && (
                  <p className="text-[11px] text-slate-500 tabular-nums">
                    وقت الإلغاء: {formatDateArabic(order.cancelledAt)}
                  </p>
                )}
              </div>

              {order.cancelProofUrl && (
                <button
                  type="button"
                  onClick={() => setProofLightboxOpen(true)}
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50 cursor-pointer shrink-0"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>صورة الإثبات</span>
                </button>
              )}
            </div>

            {order.cancelProofUrl && (
              <button
                type="button"
                onClick={() => setProofLightboxOpen(true)}
                className="block w-full overflow-hidden rounded-xl border border-red-200 bg-white cursor-pointer"
              >
                <img
                  src={order.cancelProofUrl}
                  alt="صورة إثبات الإلغاء"
                  referrerPolicy="no-referrer"
                  className="w-full max-h-40 object-cover"
                />
              </button>
            )}
          </div>
        )}

        {/* Delivery Proof Photos on Delivered Orders */}
        {order.status === 'delivered' && deliveryProofPhotos.length > 0 && (
          <div className="rounded-2xl bg-emerald-50/70 border border-emerald-200 p-3.5 space-y-2">
            <p className="text-xs font-extrabold text-emerald-800 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>صور إثبات التسليم ({deliveryProofPhotos.length})</span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              {deliveryProofPhotos.map((photoUrl, idx) => (
                <a
                  key={`${order.id}-proof-${idx}`}
                  href={photoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block overflow-hidden rounded-xl border border-emerald-200 bg-white aspect-square"
                >
                  <img
                    src={photoUrl}
                    alt={`إثبات التسليم ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Pending Assignment Accept/Reject Prompt OR State Machine Action */}
        {isPendingAssignment ? (
          renderPendingPrompt()
        ) : (
          (nextAction || canCancelDelivery) && (
            <div className="space-y-2.5">
              {nextAction && (
                <button
                  type="button"
                  onClick={() => void handleAction()}
                  disabled={updating || isAccountLocked}
                  className={`w-full min-h-[52px] flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-extrabold transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${nextAction.btnClass}`}
                >
                  {nextAction.icon}
                  <span>{updating ? 'جاري التحديث...' : nextAction.label}</span>
                </button>
              )}

              {canCancelDelivery && (
                <button
                  type="button"
                  onClick={() => onRequestCancel?.(order)}
                  disabled={updating || isAccountLocked}
                  className="w-full min-h-[46px] flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-extrabold text-red-600 hover:bg-red-50 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <XCircle className="h-4 w-4 shrink-0" />
                  <span>إلغاء التسليم</span>
                </button>
              )}
            </div>
          )
        )}
      </article>

      {/* Active Order Details Modal (opened when courier clicks an active order) */}
      {detailsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`order-details-title-${order.id}`}
          onClick={() => setDetailsOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white border border-slate-200 shadow-2xl max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sm:hidden w-10 h-1.5 bg-slate-300 rounded-full mx-auto mt-3" />

            <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-100">
              <div>
                <h3
                  id={`order-details-title-${order.id}`}
                  className="text-base sm:text-lg font-extrabold text-[#0A192F]"
                >
                  تفاصيل الطلب{' '}
                  <span className="tabular-nums" dir="ltr">
                    #{order.orderNumber}
                  </span>
                </h3>
                <p className="text-xs font-bold text-[#FF7B00]">
                  {STATUS_LABELS[order.status] ?? 'بانتظار الموافقة'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer"
                aria-label="إغلاق"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Map at the very top of Order Details Modal */}
              {!isCompleted && renderMapSection('h-[250px]')}

              {/* Pending Assignment Accept / Reject inside Modal */}
              {renderPendingPrompt()}

              {/* Addresses & Customer Info */}
              <div className="rounded-2xl bg-[#F6F8FB] border border-slate-200 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <Package className="h-4 w-4 text-[#0A192F] shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-500">
                      نقطة الاستلام · {order.pickupName}
                    </p>
                    <p className="mt-0.5 text-sm font-bold text-[#0A192F]">
                      {order.pickupAddress}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-[#FF7B00] shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-500">
                      العميل · {order.customerName}
                    </p>
                    <p className="mt-0.5 text-sm font-bold text-[#0A192F]">
                      {order.deliveryAddress}
                    </p>
                    {rawCustomerPhone && (
                      <p className="mt-1 text-xs font-bold text-slate-600 tabular-nums" dir="ltr">
                        {rawCustomerPhone}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Financial Breakdown Card inside Order Details Modal */}
              {renderFinancialBreakdownCard()}

              {order.notes && (
                <p className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs font-semibold text-amber-900">
                  ملاحظة: {order.notes}
                </p>
              )}

              {!isPendingAssignment && (nextAction || canCancelDelivery) && (
                <div className="space-y-2.5 pt-1">
                  {nextAction && (
                    <button
                      type="button"
                      onClick={() => void handleAction()}
                      disabled={updating || isAccountLocked}
                      className={`w-full min-h-[52px] flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-extrabold transition-all disabled:opacity-50 cursor-pointer ${nextAction.btnClass}`}
                    >
                      {nextAction.icon}
                      <span>{updating ? 'جاري التحديث...' : nextAction.label}</span>
                    </button>
                  )}

                  {canCancelDelivery && (
                    <button
                      type="button"
                      onClick={() => {
                        setDetailsOpen(false);
                        onRequestCancel?.(order);
                      }}
                      disabled={updating || isAccountLocked}
                      className="w-full min-h-[46px] flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-extrabold text-red-600 hover:bg-red-50 disabled:opacity-50 cursor-pointer"
                    >
                      <XCircle className="h-4 w-4 shrink-0" />
                      <span>إلغاء التسليم</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancel Proof Lightbox */}
      {proofLightboxOpen && order.cancelProofUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="معاينة صورة إثبات الإلغاء"
          onClick={() => setProofLightboxOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white p-4 space-y-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-[#0A192F]">
                صورة إثبات الإلغاء
              </h3>
              <button
                type="button"
                onClick={() => setProofLightboxOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer"
                aria-label="إغلاق"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <img
              src={order.cancelProofUrl}
              alt="صورة إثبات الإلغاء"
              referrerPolicy="no-referrer"
              className="w-full max-h-[65vh] rounded-2xl object-contain bg-[#F6F8FB]"
            />
            <a
              href={order.cancelProofUrl}
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
    </>
  );
};
