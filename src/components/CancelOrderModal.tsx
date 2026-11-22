import React, {useState} from 'react';
import {AlertCircle, Camera, X, XCircle} from 'lucide-react';
import {supabase} from '../lib/supabase';
import type {CourierOrder, CourierProfile} from '../types/hatly';

const CANCEL_REASONS = [
  'العميل غير رأيه',
  'العميل مش بيرد',
  'العميل رفض الاستلام',
  'سبب آخر',
] as const;

interface CancelOrderModalProps {
  order: CourierOrder;
  courier: CourierProfile;
  onClose: () => void;
  onSuccess: (updatedFields: {
    cancelReason: string;
    cancelProofUrl: string | null;
    cancelledAt: string;
    cancelledBy: string;
  }) => Promise<void>;
}

export const CancelOrderModal: React.FC<CancelOrderModalProps> = ({
  order,
  courier,
  onClose,
  onSuccess,
}) => {
  const [reason, setReason] = useState<string>(CANCEL_REASONS[0]);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setErrorMsg('حجم الصورة يجب ألا يتجاوز 8 ميجابايت');
      return;
    }
    setErrorMsg(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setProofFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleClearPhoto = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setProofFile(null);
    setPreviewUrl(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!reason.trim()) {
      setErrorMsg('يرجى اختيار سبب الإلغاء');
      return;
    }

    setSubmitting(true);
    try {
      let proofUrl: string | null = null;

      if (proofFile) {
        const ext = proofFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        const filePath = `${courier.id}/${order.id}_${Date.now()}.${ext}`;

        const {error: uploadError} = await supabase.storage
          .from('cancel_proofs')
          .upload(filePath, proofFile, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) {
          throw new Error(`فشل رفع صورة الإثبات: ${uploadError.message}`);
        }

        const {data: publicUrlData} = supabase.storage
          .from('cancel_proofs')
          .getPublicUrl(filePath);

        proofUrl = publicUrlData?.publicUrl || filePath;
      }

      const cancelledAt = new Date().toISOString();
      const cancelledBy = courier.profileId || courier.id;

      const {error: updateError} = await supabase
        .from('orders')
        .update({
          status: 'cancelled',
          cancel_reason: reason,
          cancel_proof_url: proofUrl,
          cancelled_at: cancelledAt,
          cancelled_by: cancelledBy,
          is_cash_collected: false,
        })
        .eq('id', order.id);

      if (updateError) {
        throw new Error(`فشل إلغاء الطلب: ${updateError.message}`);
      }

      await onSuccess({
        cancelReason: reason,
        cancelProofUrl: proofUrl,
        cancelledAt,
        cancelledBy,
      });
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'حدث خطأ غير متوقع أثناء إلغاء التسليم'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-order-title"
    >
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white border border-slate-200 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 rounded-full mx-auto mt-3" />

        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
          <div>
            <h2 id="cancel-order-title" className="text-lg font-extrabold text-[#0A192F]">
              إلغاء التسليم
            </h2>
            <p className="text-xs text-slate-500 tabular-nums" dir="ltr">
              #{order.orderNumber}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMsg && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-2xl bg-red-50 border border-red-200 p-3 text-xs sm:text-sm text-red-800"
            >
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <span className="font-medium">{errorMsg}</span>
            </div>
          )}

          <div>
            <label
              htmlFor="cancel-reason-select"
              className="block text-sm font-bold text-[#0A192F] mb-1.5"
            >
              سبب الإلغاء <span className="text-red-600">*</span>
            </label>
            <select
              id="cancel-reason-select"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-bold text-[#0A192F] focus:border-[#FF7B00] focus:outline-none focus:ring-2 focus:ring-[#FF7B00]/20 cursor-pointer"
            >
              {CANCEL_REASONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="cancel-proof-photo"
              className="block text-sm font-bold text-[#0A192F] mb-1.5"
            >
              صورة إثبات الإلغاء (اختياري)
            </label>

            {previewUrl ? (
              <div className="rounded-2xl border border-slate-200 bg-[#F6F8FB] p-3 space-y-2.5">
                <img
                  src={previewUrl}
                  alt="معاينة صورة إثبات الإلغاء"
                  className="mx-auto max-h-44 rounded-xl object-contain"
                />
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="cancel-proof-photo"
                    className="text-xs font-bold text-[#FF7B00] hover:underline cursor-pointer"
                  >
                    تغيير الصورة
                  </label>
                  <button
                    type="button"
                    onClick={handleClearPhoto}
                    className="text-xs font-bold text-red-600 hover:underline cursor-pointer"
                  >
                    إزالة الصورة
                  </button>
                </div>
              </div>
            ) : (
              <label
                htmlFor="cancel-proof-photo"
                className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-[#F6F8FB] p-4 text-center hover:border-[#FF7B00] transition-colors cursor-pointer min-h-[120px]"
              >
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-slate-200 text-[#0A192F] mb-2">
                  <Camera className="h-5 w-5" />
                </div>
                <p className="text-xs sm:text-sm font-bold text-[#0A192F]">
                  التقاط أو رفع صورة (مثل: باب مغلق)
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  اختياري · PNG أو JPG بحد أقصى 8 ميجابايت
                </p>
              </label>
            )}

            <input
              id="cancel-proof-photo"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="sr-only"
            />
          </div>

          <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs font-semibold text-amber-900 leading-relaxed">
            تنبيه: لن تتم إضافة قيمة هذا الطلب إلى عهدتك النقدية بعد تأكيد الإلغاء.
          </div>

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
              disabled={submitting}
              className="flex-2 min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-extrabold text-white hover:bg-red-700 disabled:opacity-60 transition-colors cursor-pointer"
            >
              <XCircle className="h-4 w-4 shrink-0" />
              <span>{submitting ? 'جاري الإلغاء...' : 'تأكيد الإلغاء'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
