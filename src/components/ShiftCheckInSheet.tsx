import React, {useEffect, useRef, useState} from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Clock,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
import {
  formatShiftDateArabic,
  formatShiftTimeArabic,
  getCheckInEligibility,
  recordShiftStatusEvent,
  supabase,
} from '../lib/supabase';
import type {CourierProfile, CourierShift} from '../types/hatly';

export interface ShiftCheckInCompletedPayload {
  shiftId: string;
  photoUrl: string;
  checkInTime: string;
  status: 'active' | 'late';
  lateMinutes: number;
}

interface ShiftCheckInSheetProps {
  courier: CourierProfile;
  shift: CourierShift;
  onClose: () => void;
  onSuccess: (payload?: ShiftCheckInCompletedPayload) => Promise<void>;
}

export const ShiftCheckInSheet: React.FC<ShiftCheckInSheetProps> = ({
  courier,
  shift,
  onClose,
  onSuccess,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const eligibility = getCheckInEligibility(shift);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('الكاميرا المباشرة غير مدعومة، يمكنك اختيار أو التقاط صورة من الزر أدناه.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {facingMode: 'user', width: {ideal: 720}, height: {ideal: 720}},
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 50);
    } catch {
      setCameraError('تعذر فتح الكاميرا تلقائياً. استخدم زر «التقاط / رفع صورة» بالأسفل.');
    }
  };

  useEffect(() => {
    if (eligibility.canCheckIn && !photoPreviewUrl) {
      void startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [eligibility.canCheckIn]);

  const handleCaptureFromVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 640;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Mirror horizontally for natural selfie orientation
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setPhotoBlob(blob);
        setPhotoPreviewUrl(URL.createObjectURL(blob));
        stopCamera();
      },
      'image/jpeg',
      0.88
    );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setErrorMsg('حجم الصورة يجب ألا يتجاوز 8 ميجابايت');
      return;
    }
    setErrorMsg(null);
    stopCamera();
    setPhotoBlob(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
  };

  const handleRetake = () => {
    setPhotoBlob(null);
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
      setPhotoPreviewUrl(null);
    }
    void startCamera();
  };

  const handleConfirmCheckIn = async () => {
    setErrorMsg(null);
    const currentCheck = getCheckInEligibility(shift, new Date());
    if (!currentCheck.canCheckIn) {
      setErrorMsg(currentCheck.reason || 'لا يمكن بدء الشيفت حالياً');
      return;
    }
    if (!photoBlob) {
      setErrorMsg('يرجى التقاط صورة سيلفي بالزي الرسمي أولاً');
      return;
    }

    setSubmitting(true);
    try {
      const now = new Date();
      const nowIso = now.toISOString();
      const ext = photoBlob instanceof File && photoBlob.name.includes('.')
        ? photoBlob.name.split('.').pop()?.toLowerCase() || 'jpg'
        : 'jpg';
      const filePath = `${courier.id}/${shift.id}_${Date.now()}.${ext}`;

      const {error: uploadError} = await supabase.storage
        .from('shift_photos')
        .upload(filePath, photoBlob, {
          contentType: photoBlob.type || 'image/jpeg',
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`فشل رفع صورة الحضور: ${uploadError.message}`);
      }

      const {data: publicUrlData} = supabase.storage
        .from('shift_photos')
        .getPublicUrl(filePath);

      const photoUrl = publicUrlData?.publicUrl || filePath;
      const nextStatus = currentCheck.isLate ? 'late' : 'active';

      const {error: updateError} = await supabase
        .from('courier_shifts')
        .update({
          check_in_photo_url: photoUrl,
          check_in_time: nowIso,
          status: nextStatus,
          late_minutes: currentCheck.lateMinutes,
        })
        .eq('id', shift.id);

      if (updateError) {
        throw new Error(`فشل تحديث بيانات الشيفت: ${updateError.message}`);
      }

      recordShiftStatusEvent(courier.id, {
        shiftId: shift.id,
        status: 'online',
        reason: 'check_in',
        timestamp: nowIso,
      });

      await onSuccess({
        shiftId: shift.id,
        photoUrl,
        checkInTime: nowIso,
        status: nextStatus,
        lateMinutes: currentCheck.lateMinutes,
      });
      setDone(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'حدث خطأ أثناء بدء الشيفت');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkin-sheet-title"
    >
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white border border-slate-200 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 rounded-full mx-auto mt-3" />

        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
          <h2 id="checkin-sheet-title" className="text-lg font-extrabold text-[#0A192F]">
            بدء الشيفت وتسجيل الحضور
          </h2>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Shift Summary */}
          <div className="rounded-2xl bg-[#F6F8FB] border border-slate-200 p-3.5 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">تاريخ الشيفت</span>
              <span className="font-bold text-[#0A192F]">
                {formatShiftDateArabic(shift.startDateTime)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">الموعد</span>
              <span className="font-bold text-[#0A192F] tabular-nums">
                {formatShiftTimeArabic(shift.startDateTime)} — {formatShiftTimeArabic(shift.endDateTime)}
              </span>
            </div>
          </div>

          {done ? (
            <div className="py-4 text-center space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-9 w-9" />
              </div>
              <h3 className="text-xl font-extrabold text-[#0A192F]">
                تم تسجيل حضورك وبدء الشيفت
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                يمكنك الآن تفعيل زر «متاح للعمل» من الشاشة الرئيسية لاستقبال الطلبات.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="w-full min-h-[48px] rounded-xl bg-[#0A192F] py-3 text-sm font-bold text-white hover:bg-[#13294B] cursor-pointer"
              >
                حسناً
              </button>
            </div>
          ) : !eligibility.canCheckIn ? (
            <div className="space-y-4">
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900"
              >
                <Clock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="font-bold leading-relaxed">{eligibility.reason}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-full min-h-[48px] rounded-xl bg-[#0A192F] py-3 text-sm font-bold text-white cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          ) : (
            <>
              {eligibility.isLate && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-2xl bg-amber-50 border border-amber-200 p-3.5 text-xs sm:text-sm text-amber-900"
                >
                  <Clock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <span className="font-bold leading-snug">
                    تسجيل حضور متأخر: مر على موعد بدء الشيفت{' '}
                    <span className="tabular-nums">{eligibility.lateMinutes}</span> دقيقة. سيتم تسجيل الحالة كـ «متأخر».
                  </span>
                </div>
              )}

              {errorMsg && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-2xl bg-red-50 border border-red-200 p-3 text-xs sm:text-sm text-red-800"
                >
                  <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <span className="font-medium">{errorMsg}</span>
                </div>
              )}

              <p className="text-xs font-semibold text-slate-600 leading-relaxed">
                التقط صورة سيلفي واضحة بالزي الرسمي للشركة لتأكيد بدء الشيفت.
              </p>

              {/* Camera / Photo Preview Area */}
              <div className="relative overflow-hidden rounded-2xl bg-[#0A192F] border border-slate-200 aspect-square max-h-72 mx-auto w-full flex items-center justify-center">
                {photoPreviewUrl ? (
                  <img
                    src={photoPreviewUrl}
                    alt="صورة تأكيد الحضور بالزي الرسمي"
                    className="h-full w-full object-cover"
                  />
                ) : cameraActive ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full object-cover -scale-x-100"
                  />
                ) : (
                  <div className="p-6 text-center text-white/80 space-y-2">
                    <Camera className="h-10 w-10 mx-auto text-[#FF7B00]" />
                    <p className="text-xs leading-relaxed">
                      {cameraError || 'جاري تشغيل الكاميرا الأمامية...'}
                    </p>
                  </div>
                )}
              </div>

              {/* Camera / Upload Action Controls */}
              {!photoPreviewUrl ? (
                <div className="space-y-2.5">
                  {cameraActive && (
                    <button
                      type="button"
                      onClick={handleCaptureFromVideo}
                      className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-[#0A192F] px-4 py-3 text-sm font-extrabold text-white hover:bg-[#13294B] cursor-pointer"
                    >
                      <Camera className="h-4 w-4 text-[#FF7B00]" />
                      <span>التقاط السيلفي</span>
                    </button>
                  )}

                  <label className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-[#0A192F] hover:bg-slate-50 cursor-pointer">
                    <Upload className="h-4 w-4 text-[#FF7B00]" />
                    <span>التقاط بالكاميرا أو رفع صورة</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="user"
                      onChange={handleFileUpload}
                      className="sr-only"
                    />
                  </label>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() => void handleConfirmCheckIn()}
                    disabled={submitting}
                    className="w-full min-h-[52px] flex items-center justify-center gap-2 rounded-xl bg-[#FF7B00] px-4 py-3 text-base font-extrabold text-white hover:bg-[#E56E00] disabled:opacity-60 cursor-pointer"
                  >
                    <CheckCircle2 className="h-5 w-5" />
                    <span>{submitting ? 'جاري رفع الصورة وتأكيد الحضور...' : 'تأكيد وبدء الشيفت'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleRetake}
                    disabled={submitting}
                    className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>إعادة التقاط الصورة</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
