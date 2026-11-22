import React, {useState} from 'react';
import {AlertCircle, Camera, CheckCircle2, Upload, X} from 'lucide-react';
import {formatEGP, supabase} from '../lib/supabase';
import type {CourierDeposit, CourierProfile} from '../types/hatly';

interface DepositSheetProps {
  courier: CourierProfile;
  remainingBalance: number;
  onClose: () => void;
  onSuccess: (createdDeposit?: CourierDeposit | null) => Promise<void>;
}

export const DepositSheet: React.FC<DepositSheetProps> = ({
  courier,
  remainingBalance,
  onClose,
  onSuccess,
}) => {
  const [amount, setAmount] = useState(
    remainingBalance > 0 ? String(Math.round(remainingBalance * 100) / 100) : ''
  );
  const [notes, setNotes] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setErrorMsg('حجم صورة الإيصال يجب ألا يتجاوز 8 ميجابايت');
      return;
    }
    setErrorMsg(null);
    setReceiptFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg('يرجى إدخال مبلغ توريد صحيح أكبر من صفر');
      return;
    }
    if (!receiptFile) {
      setErrorMsg('يرجى إرفاق صورة إيصال التوريد');
      return;
    }

    setSubmitting(true);
    try {
      const ext = receiptFile.name.split('.').pop()?.toLowerCase() || 'jpg';
      const filePath = `${courier.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const {error: uploadError} = await supabase.storage
        .from('deposit_receipts')
        .upload(filePath, receiptFile, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`فشل رفع صورة الإيصال: ${uploadError.message}`);
      }

      const {data: publicUrlData} = supabase.storage
        .from('deposit_receipts')
        .getPublicUrl(filePath);

      const receiptUrl = publicUrlData?.publicUrl || filePath;
      const nowIso = new Date().toISOString();

      const depositPayload: {
        courier_id: string;
        amount: number;
        receipt_url: string;
        notes?: string | null;
        deposit_date?: string;
      } = {
        courier_id: courier.id,
        amount: parsedAmount,
        receipt_url: receiptUrl,
        notes: notes.trim() || null,
        deposit_date: nowIso,
      };

      const insertAndRead = async (payload: Record<string, unknown>) => {
        const res = await supabase
          .from('courier_deposits')
          .insert(payload)
          .select('*')
          .maybeSingle();
        if (
          res.error &&
          (res.error.code === '42501' ||
            res.error.message.toLowerCase().includes('row-level security'))
        ) {
          // If SELECT after INSERT isn't permitted by RLS, fall back to plain INSERT
          const plainRes = await supabase.from('courier_deposits').insert(payload);
          return {data: null, error: plainRes.error};
        }
        return res;
      };

      let insertRes = await insertAndRead(depositPayload);
      let insertError = insertRes.error;

      // Safe fallback if optional columns ('deposit_date' or 'notes') are absent in schema cache
      if (insertError && insertError.message.toLowerCase().includes("'deposit_date'")) {
        const withoutDate = {...depositPayload};
        delete withoutDate.deposit_date;
        insertRes = await insertAndRead(withoutDate);
        insertError = insertRes.error;

        if (insertError && insertError.message.toLowerCase().includes("'notes'")) {
          const minimal = {
            courier_id: courier.id,
            amount: parsedAmount,
            receipt_url: receiptUrl,
          };
          insertRes = await insertAndRead(minimal);
          insertError = insertRes.error;
        }
      } else if (insertError && insertError.message.toLowerCase().includes("'notes'")) {
        const withoutNotes = {...depositPayload};
        delete withoutNotes.notes;
        insertRes = await insertAndRead(withoutNotes);
        insertError = insertRes.error;
      }

      if (insertError) {
        throw new Error(`فشل تسجيل التوريد: ${insertError.message}`);
      }

      const rawInserted = insertRes.data as Partial<CourierDeposit> | null;
      const createdDeposit: CourierDeposit = {
        id: String(rawInserted?.id || `local-dep-${Date.now()}`),
        courier_id: String(rawInserted?.courier_id || courier.id),
        amount: Number.isFinite(Number(rawInserted?.amount))
          ? Number(rawInserted?.amount)
          : parsedAmount,
        receipt_url: rawInserted?.receipt_url || receiptUrl,
        notes: rawInserted?.notes ?? (notes.trim() || null),
        deposit_date: rawInserted?.deposit_date ?? nowIso,
        created_at: rawInserted?.created_at || rawInserted?.deposit_date || nowIso,
      };

      // Reduce courier's cash custody immediately if column updates are permitted,
      // keeping UI in sync for unlocking accounts >= 1000 EGP
      const nextCustody = Math.max(
        0,
        Number((remainingBalance - parsedAmount).toFixed(2))
      );
      await supabase
        .from('couriers')
        .update({[courier.cashColumnKey]: nextCustody})
        .eq('profile_id', courier.profileId);

      await onSuccess(createdDeposit);
      setDone(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'حدث خطأ غير متوقع أثناء التسجيل');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deposit-sheet-title"
    >
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white border border-slate-200 shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Grab handle on mobile */}
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 rounded-full mx-auto mt-3" />

        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
          <h2 id="deposit-sheet-title" className="text-lg font-extrabold text-[#0A192F]">
            تسجيل توريد نقدي
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {done ? (
          <div className="p-6 text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-9 w-9" />
            </div>
            <h3 className="text-xl font-extrabold text-[#0A192F]">
              تم تسجيل التوريد بنجاح
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              تم إرسال إيصال التوريد بقيمة{' '}
              <strong className="text-[#0A192F] tabular-nums">{formatEGP(Number(amount))} ج.م</strong>{' '}
              وحفظه في سجل التوريدات.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full min-h-[48px] rounded-xl bg-[#0A192F] py-3 text-sm font-bold text-white hover:bg-[#13294B] cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        ) : (
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

            <div className="rounded-2xl bg-[#F6F8FB] border border-slate-200 px-4 py-3 flex items-center justify-between text-sm">
              <span className="text-slate-600 font-medium">الرصيد المتبقي الحالي</span>
              <span className="font-extrabold text-[#0A192F] tabular-nums">
                {formatEGP(remainingBalance)} ج.م
              </span>
            </div>

            <div>
              <label
                htmlFor="deposit-amount"
                className="block text-sm font-bold text-[#0A192F] mb-1.5"
              >
                المبلغ المورد (ج.م)
              </label>
              <input
                id="deposit-amount"
                type="number"
                step="0.01"
                min="1"
                inputMode="decimal"
                required
                dir="ltr"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="1000.00"
                className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-left text-base font-bold text-[#0A192F] tabular-nums focus:border-[#FF7B00] focus:outline-none focus:ring-2 focus:ring-[#FF7B00]/20"
              />
            </div>

            <div>
              <label
                htmlFor="deposit-receipt"
                className="block text-sm font-bold text-[#0A192F] mb-1.5"
              >
                صورة إيصال التوريد <span className="text-red-600">*</span>
              </label>

              <label
                htmlFor="deposit-receipt"
                className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-[#F6F8FB] p-4 text-center hover:border-[#FF7B00] transition-colors cursor-pointer min-h-[136px]"
              >
                {previewUrl ? (
                  <div className="space-y-2 w-full">
                    <img
                      src={previewUrl}
                      alt="معاينة إيصال التوريد"
                      className="mx-auto max-h-40 rounded-xl object-contain"
                    />
                    <p className="text-xs font-semibold text-[#FF7B00]">
                      اضغط لتغيير الصورة
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-white border border-slate-200 text-[#0A192F]">
                      <Camera className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-bold text-[#0A192F]">
                      التقاط أو اختيار صورة الإيصال (إلزامي)
                    </p>
                    <p className="text-xs text-slate-500">PNG أو JPG بحد أقصى 8 ميجابايت</p>
                  </div>
                )}
                <input
                  id="deposit-receipt"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </label>
            </div>

            <div>
              <label
                htmlFor="deposit-notes"
                className="block text-sm font-bold text-[#0A192F] mb-1.5"
              >
                ملاحظات (اختياري)
              </label>
              <input
                id="deposit-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="مثال: تحويل إنستاباي أو إيداع فرع"
                className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-[#0A192F] placeholder:text-slate-400 focus:border-[#FF7B00] focus:outline-none focus:ring-2 focus:ring-[#FF7B00]/20"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !receiptFile || !(Number(amount) > 0)}
              className="w-full min-h-[52px] flex items-center justify-center gap-2 rounded-xl bg-[#FF7B00] px-4 py-3 text-base font-extrabold text-white hover:bg-[#E56E00] active:scale-[0.99] disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              <Upload className="h-5 w-5" />
              <span>{submitting ? 'جاري رفع الإيصال والحفظ...' : 'تأكيد وتسجيل التوريد'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
