import React, {useEffect, useRef, useState} from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import {formatEGP, supabase} from '../lib/supabase';
import type {CourierOrder, CourierProfile} from '../types/hatly';

export interface DeliveryProofUrls {
  deliveryPhoto1: string;
  deliveryPhoto2: string;
  deliveryPhoto3: string;
}

interface DeliveryProofModalProps {
  order: CourierOrder;
  courier: CourierProfile;
  onClose: () => void;
  onConfirmDelivery: (
    order: CourierOrder,
    proofUrls: DeliveryProofUrls
  ) => Promise<string | null>;
}

type PhotoSlotKey = 'photo1' | 'photo2' | 'photo3';

interface PhotoSlotConfig {
  key: PhotoSlotKey;
  numberLabel: string;
  title: string;
  hint: string;
}

const PHOTO_SLOTS: PhotoSlotConfig[] = [
  {
    key: 'photo1',
    numberLabel: 'صورة 1',
    title: 'الطلب مع العميل',
    hint: 'التقط أو ارفع صورة توضح تسليم الطلب للعميل',
  },
  {
    key: 'photo2',
    numberLabel: 'صورة 2',
    title: 'الطلب في المكان',
    hint: 'صورة للطلب في موقع التسليم أو أمام الباب',
  },
  {
    key: 'photo3',
    numberLabel: 'صورة 3',
    title: 'صورة إضافية',
    hint: 'صورة توثيق إضافية للطلب أو الإيصال',
  },
];

interface SlotState {
  previewUrl: string | null;
  uploadedUrl: string | null;
  uploading: boolean;
  error: string | null;
}

const INITIAL_SLOT: SlotState = {
  previewUrl: null,
  uploadedUrl: null,
  uploading: false,
  error: null,
};

export const DeliveryProofModal: React.FC<DeliveryProofModalProps> = ({
  order,
  courier,
  onClose,
  onConfirmDelivery,
}) => {
  const [slots, setSlots] = useState<Record<PhotoSlotKey, SlotState>>({
    photo1: {...INITIAL_SLOT},
    photo2: {...INITIAL_SLOT},
    photo3: {...INITIAL_SLOT},
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const previewUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    return () => {
      for (const url of previewUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  const handleSelectFile = async (
    slotKey: PhotoSlotKey,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setSubmitError(null);

    if (file.size > 10 * 1024 * 1024) {
      setSlots((prev) => ({
        ...prev,
        [slotKey]: {
          ...prev[slotKey],
          error: 'حجم الصورة يجب ألا يتجاوز 10 ميجابايت',
        },
      }));
      return;
    }

    const localPreview = URL.createObjectURL(file);
    previewUrlsRef.current.push(localPreview);

    setSlots((prev) => {
      if (prev[slotKey].previewUrl) {
        URL.revokeObjectURL(prev[slotKey].previewUrl as string);
      }
      return {
        ...prev,
        [slotKey]: {
          previewUrl: localPreview,
          uploadedUrl: null,
          uploading: true,
          error: null,
        },
      };
    });

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const filePath = `${courier.id}/${order.id}/${slotKey}_${Date.now()}.${ext}`;

      const {error: uploadError} = await supabase.storage
        .from('delivery_proofs')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`فشل رفع الصورة: ${uploadError.message}`);
      }

      const {data: publicUrlData} = supabase.storage
        .from('delivery_proofs')
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData?.publicUrl || filePath;

      setSlots((prev) => ({
        ...prev,
        [slotKey]: {
          ...prev[slotKey],
          uploadedUrl: publicUrl,
          uploading: false,
          error: null,
        },
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تعذر رفع الصورة، حاول مرة أخرى';
      setSlots((prev) => ({
        ...prev,
        [slotKey]: {
          ...prev[slotKey],
          uploadedUrl: null,
          uploading: false,
          error: msg,
        },
      }));
    }
  };

  const uploadedCount = PHOTO_SLOTS.filter((s) => Boolean(slots[s.key].uploadedUrl)).length;
  const anyUploading = PHOTO_SLOTS.some((s) => slots[s.key].uploading);
  const allUploaded =
    Boolean(slots.photo1.uploadedUrl) &&
    Boolean(slots.photo2.uploadedUrl) &&
    Boolean(slots.photo3.uploadedUrl) &&
    !anyUploading;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allUploaded || submitting) return;

    setSubmitError(null);
    setSubmitting(true);
    try {
      const err = await onConfirmDelivery(order, {
        deliveryPhoto1: slots.photo1.uploadedUrl as string,
        deliveryPhoto2: slots.photo2.uploadedUrl as string,
        deliveryPhoto3: slots.photo3.uploadedUrl as string,
      });

      if (err) {
        setSubmitError(err);
      }
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'حدث خطأ غير متوقع أثناء تأكيد التسليم'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const isBusy = anyUploading || submitting;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-xs sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delivery-proof-modal-title"
    >
      <div
        dir="rtl"
        className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white border border-slate-200 shadow-2xl max-h-[92vh] overflow-y-auto"
      >
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 rounded-full mx-auto mt-3" />

        {/* Header */}
        <div className="sticky top-0 z-10 bg-white flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
          <div>
            <h2
              id="delivery-proof-modal-title"
              className="text-lg font-extrabold text-[#0A192F]"
            >
              إثبات التسليم
            </h2>
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <span className="tabular-nums font-bold text-[#0A192F]" dir="ltr">
                #{order.orderNumber}
              </span>
              <span aria-hidden="true">·</span>
              <span>{order.customerName}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleConfirm} className="p-5 space-y-4">
          {/* Progress indicator */}
          <div className="rounded-2xl bg-[#0A192F] text-white p-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FF7B00]/20 text-[#FF7B00]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-extrabold">
                  ارفع 3 صور إلزامية لتأكيد التسليم
                </p>
                <p className="text-[11px] text-slate-300">
                  المطلوب تحصيله:{' '}
                  <span className="font-extrabold text-[#FF7B00] tabular-nums">
                    {formatEGP(order.totalAmount)} ج.م
                  </span>
                </p>
              </div>
            </div>
            <span className="shrink-0 rounded-xl bg-white/10 px-2.5 py-1 text-xs font-extrabold tabular-nums">
              {uploadedCount} / 3
            </span>
          </div>

          {submitError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-2xl bg-red-50 border border-red-200 p-3 text-xs sm:text-sm text-red-800"
            >
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <span className="font-semibold">{submitError}</span>
            </div>
          )}

          {/* 3 Mandatory Image Upload Slots */}
          <div className="space-y-3">
            {PHOTO_SLOTS.map((slot) => {
              const state = slots[slot.key];
              const inputId = `delivery-proof-input-${order.id}-${slot.key}`;
              const isReady = Boolean(state.uploadedUrl) && !state.uploading;

              return (
                <div
                  key={slot.key}
                  className={`rounded-2xl border p-3.5 transition-colors ${
                    state.error
                      ? 'border-red-300 bg-red-50/40'
                      : isReady
                        ? 'border-emerald-300 bg-emerald-50/40'
                        : 'border-slate-200 bg-[#F6F8FB]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div>
                      <p className="text-xs sm:text-sm font-extrabold text-[#0A192F]">
                        {slot.numberLabel}: {slot.title}{' '}
                        <span className="text-red-600">*</span>
                      </p>
                      <p className="text-[11px] text-slate-500">{slot.hint}</p>
                    </div>

                    {state.uploading ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#FF7B00] shrink-0">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>جاري الرفع...</span>
                      </span>
                    ) : isReady ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-emerald-700 shrink-0">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>تم الرفع</span>
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-slate-400 shrink-0">
                        مطلوبة
                      </span>
                    )}
                  </div>

                  {state.previewUrl ? (
                    <div className="flex items-center gap-3">
                      <img
                        src={state.previewUrl}
                        alt={`${slot.numberLabel}: ${slot.title}`}
                        className="h-20 w-24 rounded-xl object-cover border border-slate-200 bg-white shrink-0"
                      />
                      <div className="flex-1 min-w-0 space-y-1.5">
                        {state.error && (
                          <p className="text-xs font-bold text-red-600 leading-snug">
                            {state.error}
                          </p>
                        )}
                        <label
                          htmlFor={inputId}
                          className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-extrabold text-[#0A192F] hover:bg-slate-50 cursor-pointer"
                        >
                          <RefreshCw className="h-3.5 w-3.5 text-[#FF7B00]" />
                          <span>{state.error ? 'إعادة المحاولة' : 'تغيير الصورة'}</span>
                        </label>
                      </div>
                    </div>
                  ) : (
                    <label
                      htmlFor={inputId}
                      className="flex items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-3 text-xs sm:text-sm font-bold text-[#0A192F] hover:border-[#FF7B00] transition-colors cursor-pointer min-h-[56px]"
                    >
                      <Camera className="h-5 w-5 text-[#FF7B00] shrink-0" />
                      <span>التقاط بالكاميرا أو اختيار صورة</span>
                    </label>
                  )}

                  <input
                    id={inputId}
                    type="file"
                    accept="image/*"
                    onChange={(ev) => void handleSelectFile(slot.key, ev)}
                    disabled={submitting}
                    className="sr-only"
                  />
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 min-h-[48px] rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
            >
              رجوع
            </button>
            <button
              type="submit"
              disabled={!allUploaded || isBusy}
              className="flex-2 min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-extrabold text-white hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>جاري تأكيد التسليم...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>تأكيد التسليم</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
