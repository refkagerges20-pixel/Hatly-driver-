import {createClient, type User} from '@supabase/supabase-js';
import type {
  CourierAvailability,
  CourierDeposit,
  CourierNotification,
  CourierOrder,
  CourierProfile,
  CourierShift,
  OrderStatus,
  RawCourierRow,
  RawNotificationRow,
  RawOrderRow,
  RawShiftRow,
  ShiftStatus,
  ShiftStatusEvent,
} from '../types/hatly';

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://tvomnfmwrcpgoearuvfm.supabase.co';
export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_WNFa_gog8y8I7fX_utKudQ_32QuQTKl';
export const CASH_LOCK_LIMIT_EGP = 1000;
export const SHIFT_CHECKIN_EARLY_MINUTES = 0;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export function normalizeCourier(
  row: RawCourierRow,
  authUser?: User | null,
  profileRow?: {full_name?: string | null; name?: string | null; email?: string | null; phone?: string | null} | null
): CourierProfile {
  let cashColumnKey: CourierProfile['cashColumnKey'] = 'cash_custody';
  let cashCustody = 0;

  if (typeof row.cash_custody === 'number') {
    cashColumnKey = 'cash_custody';
    cashCustody = row.cash_custody;
  } else if (typeof row.cash_balance === 'number') {
    cashColumnKey = 'cash_balance';
    cashCustody = row.cash_balance;
  } else if (typeof row.custody_balance === 'number') {
    cashColumnKey = 'custody_balance';
    cashCustody = row.custody_balance;
  } else if (typeof row.balance === 'number') {
    cashColumnKey = 'balance';
    cashCustody = row.balance;
  } else if ('cash_balance' in row) {
    cashColumnKey = 'cash_balance';
    cashCustody = Number(row.cash_balance ?? 0);
  } else if ('custody_balance' in row) {
    cashColumnKey = 'custody_balance';
    cashCustody = Number(row.custody_balance ?? 0);
  } else {
    cashColumnKey = 'cash_custody';
    cashCustody = Number(row.cash_custody ?? 0);
  }

  const normalizedStatus: CourierAvailability =
    row.status === 'online' ? 'online' : 'offline';

  const rawAccountStatus = String(row.account_status ?? 'pending').trim().toLowerCase();

  return {
    id: row.id,
    profileId: row.profile_id || authUser?.id || row.id,
    userId: row.user_id || row.profile_id || authUser?.id || row.id,
    fullName:
      row.full_name ||
      row.name ||
      profileRow?.full_name ||
      profileRow?.name ||
      authUser?.user_metadata?.full_name ||
      'مندوب هاتلي',
    email: row.email || profileRow?.email || authUser?.email || '',
    phone: row.phone || profileRow?.phone || '',
    accountStatus: rawAccountStatus,
    status: normalizedStatus,
    cashCustody: Number.isFinite(cashCustody) ? cashCustody : 0,
    cashColumnKey,
    currentLat: typeof row.current_lat === 'number' ? row.current_lat : null,
    currentLng: typeof row.current_lng === 'number' ? row.current_lng : null,
    vehicleType: row.vehicle_type || null,
    commissionRate: typeof row.commission_rate === 'number' ? row.commission_rate : null,
    forceOnline:
      row.force_online === true ||
      String(row.force_online ?? '').trim().toLowerCase() === 'true',
  };
}

function toFiniteCoord(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

export interface OrderLocationEnrichment {
  merchantName?: string | null;
  merchantAddress?: string | null;
  merchantLat?: number | null;
  merchantLng?: number | null;
  zoneName?: string | null;
  zoneLat?: number | null;
  zoneLng?: number | null;
}

export function normalizeOrder(
  row: RawOrderRow,
  enrichment?: OrderLocationEnrichment
): CourierOrder {
  const statusMap: Record<string, OrderStatus> = {
    assigned: 'assigned',
    pending: 'assigned',
    confirmed: 'assigned',
    preparing: 'assigned',
    ready: 'assigned',
    confirmed_by_courier: 'confirmed_by_courier',
    accepted: 'confirmed_by_courier',
    courier_accepted: 'confirmed_by_courier',
    courier_confirmed: 'confirmed_by_courier',
    on_the_way_to_pickup: 'on_the_way_to_pickup',
    heading_to_pickup: 'on_the_way_to_pickup',
    en_route_to_pickup: 'on_the_way_to_pickup',
    picked_up: 'picked_up',
    on_the_way: 'on_the_way',
    out_for_delivery: 'on_the_way',
    in_progress: 'on_the_way',
    delivered: 'delivered',
    completed: 'delivered',
    done: 'delivered',
    finished: 'delivered',
    cancelled: 'cancelled',
    canceled: 'cancelled',
    returned: 'cancelled',
  };

  const safeId = String(row?.id || '');
  const rawStatus = String(row?.status ?? 'assigned').trim().toLowerCase();
  const totalAmount = Number(
    row?.total ?? row?.total_amount ?? row?.cod_amount ?? row?.cash_amount ?? row?.amount ?? 0
  );
  const deliveryFee = Number(row?.delivery_fee ?? 0);
  const deliveryFeeNet = Number(row?.delivery_fee_net ?? row?.delivery_fee ?? 0);
  const rawProductsTotal = toFiniteCoord(row?.products_total);
  const rawAmountToCollect = toFiniteCoord(row?.amount_to_collect);
  const rawSubtotal = toFiniteCoord(row?.subtotal);
  const safeFeeNet = Number.isFinite(deliveryFeeNet) ? deliveryFeeNet : 0;
  const safeTotal = Number.isFinite(totalAmount) ? totalAmount : 0;
  const productsAmount =
    rawProductsTotal !== null && (rawProductsTotal > 0 || rawAmountToCollect === null)
      ? rawProductsTotal
      : rawAmountToCollect !== null
        ? rawAmountToCollect
        : rawSubtotal !== null
          ? rawSubtotal
          : Math.max(0, Number((safeTotal - safeFeeNet).toFixed(2)));
  const courierCommission = Number(row?.courier_commission ?? row?.commission ?? 0);
  const hatlyNetRevenue = Number(row?.hatly_net_revenue ?? 0);

  const pickupLat =
    toFiniteCoord(row?.pickup_lat) ??
    toFiniteCoord(row?.merchant_lat) ??
    enrichment?.merchantLat ??
    enrichment?.zoneLat ??
    null;
  const pickupLng =
    toFiniteCoord(row?.pickup_lng) ??
    toFiniteCoord(row?.merchant_lng) ??
    enrichment?.merchantLng ??
    enrichment?.zoneLng ??
    null;

  const deliveryLat =
    toFiniteCoord(row?.delivery_lat) ??
    toFiniteCoord(row?.dropoff_lat) ??
    toFiniteCoord(row?.latitude) ??
    toFiniteCoord(row?.customer_lat) ??
    null;
  const deliveryLng =
    toFiniteCoord(row?.delivery_lng) ??
    toFiniteCoord(row?.dropoff_lng) ??
    toFiniteCoord(row?.longitude) ??
    toFiniteCoord(row?.customer_lng) ??
    null;

  const mappedStatus = statusMap[rawStatus] ?? 'assigned';
  const acceptedOrMapped =
    mappedStatus === 'assigned' && isOrderLocallyAccepted(safeId)
      ? 'confirmed_by_courier'
      : mappedStatus;
  const effectiveStatus =
    (acceptedOrMapped === 'confirmed_by_courier' || acceptedOrMapped === 'accepted') &&
    isOrderLocallyPickupEnroute(safeId)
      ? 'on_the_way_to_pickup'
      : acceptedOrMapped;

  return {
    id: safeId,
    orderNumber: String(row?.order_number || row?.code || safeId.slice(0, 8) || 'ORD').toUpperCase(),
    status: effectiveStatus,
    pickupName:
      row?.pickup_name ||
      row?.merchant_name ||
      row?.store_name ||
      enrichment?.merchantName ||
      enrichment?.zoneName ||
      'نقطة الاستلام',
    pickupAddress:
      row?.pickup_address ||
      row?.pickup_location ||
      enrichment?.merchantAddress ||
      'غير محدد',
    pickupLat,
    pickupLng,
    deliveryAddress:
      row?.delivery_address || row?.delivery_location || row?.dropoff_address || 'غير محدد',
    deliveryLat,
    deliveryLng,
    customerName: row?.customer_name || 'العميل',
    customerPhone: row?.customer_phone || '',
    totalAmount: Number.isFinite(totalAmount) ? totalAmount : 0,
    productsAmount: Number.isFinite(productsAmount) ? productsAmount : 0,
    amountToCollect: rawAmountToCollect,
    deliveryFee: Number.isFinite(deliveryFee) ? deliveryFee : 0,
    deliveryFeeNet: Number.isFinite(deliveryFeeNet) ? deliveryFeeNet : 0,
    courierCommission: Number.isFinite(courierCommission) ? courierCommission : 0,
    hatlyNetRevenue: Number.isFinite(hatlyNetRevenue) ? hatlyNetRevenue : 0,
    isCashCollected: Boolean(row?.is_cash_collected),
    deliveryPhoto1: row?.delivery_photo_1 || null,
    deliveryPhoto2: row?.delivery_photo_2 || null,
    deliveryPhoto3: row?.delivery_photo_3 || null,
    paymentMethod: String(row?.payment_method || 'cash'),
    notes: row?.notes || null,
    createdAt: row?.created_at || new Date().toISOString(),
    deliveredAt:
      row?.delivered_at ||
      (statusMap[rawStatus] === 'delivered' ? row?.updated_at || null : null),
    cancelReason: row?.cancel_reason || null,
    cancelProofUrl: row?.cancel_proof_url || null,
    cancelledAt: row?.cancelled_at || null,
    cancelledBy: row?.cancelled_by || null,
    rejectedByCouriers: Array.isArray(row?.rejected_by_couriers)
      ? row.rejected_by_couriers.map(String)
      : [],
  };
}

function parseShiftDateTime(dateStr: string | null | undefined, timeStr: string | null | undefined): Date {
  const safeTime = typeof timeStr === 'string' && timeStr.trim() ? timeStr.trim() : '00:00:00';
  const safeDate =
    typeof dateStr === 'string' && dateStr.trim()
      ? dateStr.trim()
      : new Date().toISOString().slice(0, 10);

  // Handle full ISO timestamps directly if provided
  if (safeTime.includes('T') || (safeTime.includes('-') && safeTime.length > 10)) {
    const parsed = new Date(safeTime);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const cleanDate = safeDate.slice(0, 10); // YYYY-MM-DD
  const [y, m, d] = cleanDate.split('-').map((n) => parseInt(n, 10));
  const timeParts = safeTime.split(':').map((n) => parseInt(n, 10));
  const hh = Number.isFinite(timeParts[0]) ? timeParts[0] : 0;
  const mm = Number.isFinite(timeParts[1]) ? timeParts[1] : 0;
  const ss = Number.isFinite(timeParts[2]) ? timeParts[2] : 0;

  if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
    const constructed = new Date(y, m - 1, d, hh, mm, ss, 0);
    if (!Number.isNaN(constructed.getTime())) return constructed;
  }
  const fallback = new Date(`${cleanDate}T${safeTime}`);
  return Number.isNaN(fallback.getTime()) ? new Date() : fallback;
}

export function normalizeShift(row: RawShiftRow): CourierShift {
  const safeStartTime =
    typeof row?.start_time === 'string' && row.start_time.trim()
      ? row.start_time
      : '00:00:00';
  const safeEndTime =
    typeof row?.end_time === 'string' && row.end_time.trim()
      ? row.end_time
      : '23:59:59';

  const rawDate =
    row?.shift_date ||
    row?.date ||
    (safeStartTime.includes('T')
      ? safeStartTime.slice(0, 10)
      : new Date().toISOString().slice(0, 10));

  const startDateTime = parseShiftDateTime(rawDate, safeStartTime);
  const endDateTime = parseShiftDateTime(rawDate, safeEndTime);

  // Support overnight shifts (e.g., 22:00 -> 04:00 next day)
  if (endDateTime.getTime() <= startDateTime.getTime()) {
    endDateTime.setDate(endDateTime.getDate() + 1);
  }

  const statusMap: Record<string, ShiftStatus> = {
    scheduled: 'scheduled',
    pending: 'scheduled',
    upcoming: 'scheduled',
    active: 'active',
    checked_in: 'active',
    in_progress: 'active',
    late: 'late',
    completed: 'completed',
    finished: 'completed',
    missed: 'missed',
    absent: 'missed',
    cancelled: 'cancelled',
    canceled: 'cancelled',
  };

  const normalizedStatus: ShiftStatus =
    statusMap[String(row?.status || 'scheduled').trim().toLowerCase()] ?? 'scheduled';

  return {
    id: String(row?.id || ''),
    courierId: String(row?.courier_id || ''),
    shiftDate: String(rawDate),
    startTimeRaw: safeStartTime,
    endTimeRaw: safeEndTime,
    startDateTime,
    endDateTime,
    status: normalizedStatus,
    checkInTime: row?.check_in_time || null,
    checkOutTime: row?.check_out_time || null,
    checkInPhotoUrl: row?.check_in_photo_url || null,
    lateMinutes: Number.isFinite(Number(row?.late_minutes)) ? Number(row?.late_minutes) : 0,
    offlineMinutes:
      row?.offline_minutes !== undefined &&
      row?.offline_minutes !== null &&
      Number.isFinite(Number(row.offline_minutes))
        ? Number(row.offline_minutes)
        : null,
    notes: row?.notes || null,
  };
}

export function getCheckInEligibility(
  shift: CourierShift,
  now: Date = new Date()
): {
  canCheckIn: boolean;
  reason: string | null;
  isTooEarly: boolean;
  isLate: boolean;
  lateMinutes: number;
} {
  if (shift.checkOutTime || shift.status === 'completed') {
    return {
      canCheckIn: false,
      reason: 'تم إنهاء هذا الشيفت بالفعل',
      isTooEarly: false,
      isLate: false,
      lateMinutes: shift.lateMinutes,
    };
  }

  if (
    shift.checkInPhotoUrl &&
    (shift.checkInTime || shift.status === 'active' || shift.status === 'late')
  ) {
    return {
      canCheckIn: false,
      reason: 'تم تسجيل الحضور لهذا الشيفت بالفعل',
      isTooEarly: false,
      isLate: shift.status === 'late',
      lateMinutes: shift.lateMinutes,
    };
  }

  if (shift.status === 'missed' || now.getTime() > shift.endDateTime.getTime()) {
    return {
      canCheckIn: false,
      reason: 'انتهى موعد هذا الشيفت وتم تسجيله كغياب',
      isTooEarly: false,
      isLate: false,
      lateMinutes: 0,
    };
  }

  if (shift.status === 'cancelled') {
    return {
      canCheckIn: false,
      reason: 'هذا الشيفت غير متاح للتسجيل',
      isTooEarly: false,
      isLate: false,
      lateMinutes: 0,
    };
  }

  const msBeforeStart = shift.startDateTime.getTime() - now.getTime();
  const maxEarlyMs = SHIFT_CHECKIN_EARLY_MINUTES * 60 * 1000;

  if (msBeforeStart > maxEarlyMs) {
    return {
      canCheckIn: false,
      reason: 'لا يمكنك بدء العمل قبل موعد ورديتك المحدد.',
      isTooEarly: true,
      isLate: false,
      lateMinutes: 0,
    };
  }

  const msAfterStart = now.getTime() - shift.startDateTime.getTime();
  const isLate = msAfterStart > 60 * 1000; // More than 1 min past start_time counts as late
  const lateMinutes = isLate ? Math.max(1, Math.floor(msAfterStart / 60000)) : 0;

  return {
    canCheckIn: true,
    reason: null,
    isTooEarly: false,
    isLate,
    lateMinutes,
  };
}

export async function fetchCourierByAuthUser(user: User): Promise<{
  courier: CourierProfile | null;
  error: string | null;
}> {
  try {
    console.log('[Hatly Auth] Fetching courier directly using logged-in user ID:', {
      authUserId: user.id,
      email: user.email,
    });

    // 1. Primary query: fetch courier directly using profile_id = auth.user.id
    const byProfileId = await supabase
      .from('couriers')
      .select('*')
      .eq('profile_id', user.id)
      .maybeSingle();

    console.log('[Hatly Couriers] Direct query by profile_id:', {
      courierId: (byProfileId.data as RawCourierRow | null)?.id ?? null,
      profileId: (byProfileId.data as RawCourierRow | null)?.profile_id ?? null,
      data: byProfileId.data,
      error: byProfileId.error,
    });

    // Optional non-blocking profiles metadata fetch
    let profileRow: {
      full_name?: string | null;
      email?: string | null;
      phone?: string | null;
    } | null = null;
    try {
      const profileRes = await supabase
        .from('profiles')
        .select('id, full_name, email, phone')
        .eq('id', user.id)
        .maybeSingle();
      if (!profileRes.error && profileRes.data) {
        profileRow = profileRes.data as {
          full_name?: string | null;
          email?: string | null;
          phone?: string | null;
        };
      }
    } catch {
      profileRow = null;
    }

    if (byProfileId.data) {
      const normalized = normalizeCourier(byProfileId.data as RawCourierRow, user, profileRow);
      console.log('[Hatly Couriers] Verified courier ID & profile_id:', {
        courierId: normalized.id,
        profileId: normalized.profileId,
        accountStatus: normalized.accountStatus,
        status: normalized.status,
      });
      return {courier: normalized, error: null};
    }

    // 2. Fallback: match couriers.id = auth.user.id
    const byId = await supabase
      .from('couriers')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    console.log('[Hatly Couriers] Fallback query by id:', {
      data: byId.data,
      error: byId.error,
    });

    if (byId.data) {
      const normalized = normalizeCourier(byId.data as RawCourierRow, user, profileRow);
      console.log('[Hatly Couriers] Resolved courier (via id):', normalized);
      return {courier: normalized, error: null};
    }

    // 3. Fallback: match couriers.user_id = auth.user.id
    const byUserId = await supabase
      .from('couriers')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    console.log('[Hatly Couriers] Fallback query by user_id:', {
      data: byUserId.data,
      error: byUserId.error,
    });

    if (byUserId.data) {
      const normalized = normalizeCourier(byUserId.data as RawCourierRow, user, profileRow);
      console.log('[Hatly Couriers] Resolved courier (via user_id):', normalized);
      return {courier: normalized, error: null};
    }

    // 4. Fallback: match couriers.email = auth.user.email
    if (user.email) {
      const byEmail = await supabase
        .from('couriers')
        .select('*')
        .eq('email', user.email)
        .maybeSingle();

      console.log('[Hatly Couriers] Fallback query by email:', {
        data: byEmail.data,
        error: byEmail.error,
      });

      if (byEmail.data) {
        const normalized = normalizeCourier(byEmail.data as RawCourierRow, user, profileRow);
        console.log('[Hatly Couriers] Resolved courier (via email):', normalized);
        return {courier: normalized, error: null};
      }
    }

    const firstError =
      byProfileId.error?.message || byId.error?.message || byUserId.error?.message || null;
    console.log('[Hatly Couriers] No courier row found. Error:', firstError);
    return {courier: null, error: firstError};
  } catch (err) {
    console.error('[Hatly Auth] Unexpected error fetching courier:', err);
    return {
      courier: null,
      error: err instanceof Error ? err.message : 'تعذر تحميل بيانات المندوب',
    };
  }
}

const ORDER_FULL_LIGHTWEIGHT_COLUMNS = [
  'id',
  'order_number',
  'courier_id',
  'status',
  'total',
  'products_total',
  'amount_to_collect',
  'delivery_fee',
  'delivery_fee_net',
  'courier_commission',
  'hatly_net_revenue',
  'payment_method',
  'is_cash_collected',
  'customer_name',
  'customer_phone',
  'pickup_address',
  'pickup_name',
  'delivery_address',
  'latitude',
  'longitude',
  'merchant_id',
  'from_zone_id',
  'notes',
  'created_at',
  'updated_at',
  'delivery_photo_1',
  'delivery_photo_2',
  'delivery_photo_3',
  'cancel_reason',
  'cancel_proof_url',
  'cancelled_at',
  'cancelled_by',
  'rejected_by_couriers',
].join(',');

const ORDER_CORE_LIGHTWEIGHT_COLUMNS = [
  'id',
  'order_number',
  'courier_id',
  'status',
  'total',
  'delivery_fee',
  'delivery_fee_net',
  'payment_method',
  'is_cash_collected',
  'customer_name',
  'customer_phone',
  'pickup_address',
  'delivery_address',
  'latitude',
  'longitude',
  'merchant_id',
  'notes',
  'created_at',
].join(',');

const ORDERS_CACHE_PREFIX = 'hatly_cached_orders_';

export function getCachedCourierOrders(courierId: string): CourierOrder[] {
  if (!courierId || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(`${ORDERS_CACHE_PREFIX}${courierId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CourierOrder[]) : [];
  } catch {
    return [];
  }
}

function setCachedCourierOrders(courierId: string, orders: CourierOrder[]): void {
  if (!courierId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${ORDERS_CACHE_PREFIX}${courierId}`, JSON.stringify(orders));
  } catch {
    // ignore storage quota errors
  }
}

function isColumnOrSchemaError(errMsg: string | undefined, errCode?: string): boolean {
  const msg = String(errMsg ?? '').toLowerCase();
  const code = String(errCode ?? '').toUpperCase();
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    (msg.includes('column') && msg.includes('does not exist')) ||
    msg.includes('schema cache') ||
    msg.includes('could not find')
  );
}

let resolvedOrderSelectMode: 'full' | 'core' | 'star' = 'full';

export async function fetchCourierOrders(
  courierId: string,
  options?: {alternateCourierIds?: string[]}
): Promise<{
  orders: CourierOrder[];
  error: string | null;
}> {
  try {
    if (!courierId) return {orders: [], error: null};

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const cached = getCachedCourierOrders(courierId);
      if (cached.length > 0) {
        return {orders: cached, error: null};
      }
    }

    let rawData: unknown[] | null = null;
    let error: {message: string; code?: string; details?: string} | null = null;

    const runOrderQuery = async (selectCols: string) =>
      supabase
        .from('orders')
        .select(selectCols)
        .eq('courier_id', courierId)
        .order('created_at', {ascending: false});

    // Fetch ALL orders for this courier_id (never filter by status='new')
    if (resolvedOrderSelectMode === 'full') {
      const fullRes = await runOrderQuery(ORDER_FULL_LIGHTWEIGHT_COLUMNS);
      rawData = Array.isArray(fullRes.data) ? (fullRes.data as unknown[]) : null;
      error = fullRes.error;
      if (error && isColumnOrSchemaError(error.message, error.code)) {
        console.warn(
          '[Hatly Orders] Full lightweight select failed on schema, retrying core columns:',
          error.message
        );
        resolvedOrderSelectMode = 'core';
      }
    }

    if (resolvedOrderSelectMode === 'core') {
      const coreRes = await runOrderQuery(ORDER_CORE_LIGHTWEIGHT_COLUMNS);
      rawData = Array.isArray(coreRes.data) ? (coreRes.data as unknown[]) : null;
      error = coreRes.error;
      if (error && isColumnOrSchemaError(error.message, error.code)) {
        console.warn(
          '[Hatly Orders] Core columns select failed, retrying select(*):',
          error.message
        );
        resolvedOrderSelectMode = 'star';
      }
    }

    if (resolvedOrderSelectMode === 'star') {
      const starRes = await runOrderQuery('*');
      rawData = Array.isArray(starRes.data) ? (starRes.data as unknown[]) : null;
      error = starRes.error;
    }

    console.log('[Hatly Orders] Query response:', {
      fetchedWithCourierId: courierId,
      count: rawData?.length ?? 0,
      error: error ? {message: error.message, code: error.code, details: error.details} : null,
    });

    if (error) {
      console.error('[Hatly Orders] Error fetching orders for courier_id:', courierId, error);
      const cached = getCachedCourierOrders(courierId);
      if (cached.length > 0 && isLikelyOfflineError(error.message)) {
        return {orders: cached, error: null};
      }
      return {orders: [], error: error.message};
    }

    let rows = Array.isArray(rawData) ? (rawData as RawOrderRow[]).filter(Boolean) : [];

    // Diagnostic logging when 0 orders returned: compare queried courier_id against database orders
    if (rows.length === 0) {
      console.warn('[Hatly Orders] Empty array returned for courier_id:', courierId);
      try {
        const altIds = (options?.alternateCourierIds ?? []).filter(
          (id) => Boolean(id) && id !== courierId
        );
        const diagRes = await supabase
          .from('orders')
          .select('id,order_number,courier_id,status')
          .limit(10);
        const dbSample = Array.isArray(diagRes.data)
          ? (diagRes.data as {id?: string; order_number?: string; courier_id?: string | null; status?: string}[])
          : [];
        console.warn('[Hatly Orders] DB courier_id comparison diagnostic:', {
          usedCourierId: courierId,
          alternateCourierIds: altIds,
          dbSampleCourierIds: dbSample.map((o) => ({
            id: o.id,
            order_number: o.order_number,
            courier_id: o.courier_id,
            status: o.status,
            matchesUsedCourierId: o.courier_id === courierId,
          })),
          diagnosticError: diagRes.error?.message ?? null,
        });

        // If orders in DB were assigned to an alternate ID (e.g. profile_id) while primary courierId returned 0,
        // log the exact mismatch and fetch them as a resilience fallback.
        if (altIds.length > 0) {
          const altRes = await supabase
            .from('orders')
            .select('*')
            .in('courier_id', altIds)
            .order('created_at', {ascending: false});
          if (!altRes.error && Array.isArray(altRes.data) && altRes.data.length > 0) {
            console.warn(
              '[Hatly Orders] Found orders matching alternate ID (profile_id/user_id) instead of couriers.id:',
              {usedCourierId: courierId, alternateIds: altIds, matchedCount: altRes.data.length}
            );
            rows = (altRes.data as RawOrderRow[]).filter(Boolean);
          }
        }
      } catch (diagErr) {
        console.warn('[Hatly Orders] Diagnostic check skipped:', diagErr);
      }
    }

    // Enrich pickup coordinates & store names from merchants (merchant_id) and zones (from_zone_id)
    const merchantIds = Array.from(
      new Set(
        rows
          .map((r) => (typeof r.merchant_id === 'string' && r.merchant_id ? r.merchant_id : null))
          .filter((v): v is string => Boolean(v))
      )
    );
    const zoneIds = Array.from(
      new Set(
        rows
          .map((r) => (typeof r.from_zone_id === 'string' && r.from_zone_id ? r.from_zone_id : null))
          .filter((v): v is string => Boolean(v))
      )
    );

    const merchantMap = new Map<
      string,
      {name: string | null; address: string | null; lat: number | null; lng: number | null}
    >();
    const zoneMap = new Map<string, {name: string | null; lat: number | null; lng: number | null}>();

    await Promise.all([
      merchantIds.length > 0
        ? (async () => {
            try {
              const mRes = await supabase
                .from('merchants')
                .select('id,store_name,address,lat,lng')
                .in('id', merchantIds);
              let mRows = (!mRes.error && Array.isArray(mRes.data)
                ? mRes.data
                : null) as Record<string, unknown>[] | null;
              if (mRes.error) {
                const mFallback = await supabase
                  .from('merchants')
                  .select('id,store_name,address')
                  .in('id', merchantIds);
                if (!mFallback.error && Array.isArray(mFallback.data)) {
                  mRows = mFallback.data as Record<string, unknown>[];
                }
              }
              if (mRows) {
                for (const m of mRows) {
                  const mid = String(m?.id ?? '');
                  if (!mid) continue;
                  merchantMap.set(mid, {
                    name:
                      (m.store_name as string | null) ??
                      (m.business_name as string | null) ??
                      (m.name as string | null) ??
                      null,
                    address: (m.address as string | null) ?? (m.location as string | null) ?? null,
                    lat: toFiniteCoord(m.lat ?? m.latitude),
                    lng: toFiniteCoord(m.lng ?? m.longitude),
                  });
                }
              }
            } catch {
              // Non-blocking fallback
            }
          })()
        : Promise.resolve(),
      zoneIds.length > 0
        ? (async () => {
            try {
              const zRes = await supabase
                .from('zones')
                .select('id,name,lat,lng')
                .in('id', zoneIds);
              let zRows = (!zRes.error && Array.isArray(zRes.data)
                ? zRes.data
                : null) as Record<string, unknown>[] | null;
              if (zRes.error) {
                const zFallback = await supabase
                  .from('zones')
                  .select('id,name')
                  .in('id', zoneIds);
                if (!zFallback.error && Array.isArray(zFallback.data)) {
                  zRows = zFallback.data as Record<string, unknown>[];
                }
              }
              if (zRows) {
                for (const z of zRows) {
                  const zid = String(z?.id ?? '');
                  if (!zid) continue;
                  zoneMap.set(zid, {
                    name: (z.name as string | null) ?? (z.title as string | null) ?? null,
                    lat: toFiniteCoord(z.lat ?? z.latitude ?? z.center_lat),
                    lng: toFiniteCoord(z.lng ?? z.longitude ?? z.center_lng),
                  });
                }
              }
            } catch {
              // Non-blocking fallback
            }
          })()
        : Promise.resolve(),
    ]);

    const rejectingIds = new Set(
      [courierId, ...(options?.alternateCourierIds ?? [])].filter((v): v is string => Boolean(v))
    );

    const visibleRows = rows.filter((row) => {
      const rawStatus = String(row?.status ?? '').trim().toLowerCase();
      if (rawStatus === 'new') return false;
      if (Array.isArray(row?.rejected_by_couriers)) {
        const rejectedList = row.rejected_by_couriers.map(String);
        if (rejectedList.some((id) => rejectingIds.has(id))) {
          return false;
        }
      }
      return true;
    });

    const normalizedOrders = visibleRows.map((row) => {
      const mInfo = row.merchant_id ? merchantMap.get(String(row.merchant_id)) : undefined;
      const zInfo = row.from_zone_id ? zoneMap.get(String(row.from_zone_id)) : undefined;
      return normalizeOrder(row, {
        merchantName: mInfo?.name,
        merchantAddress: mInfo?.address,
        merchantLat: mInfo?.lat,
        merchantLng: mInfo?.lng,
        zoneName: zInfo?.name,
        zoneLat: zInfo?.lat,
        zoneLng: zInfo?.lng,
      });
    });

    setCachedCourierOrders(courierId, normalizedOrders);
    return {
      orders: normalizedOrders,
      error: null,
    };
  } catch (err) {
    console.error('[Hatly Orders] Unexpected error fetching orders:', err);
    const cached = getCachedCourierOrders(courierId);
    if (cached.length > 0) {
      return {orders: cached, error: null};
    }
    return {
      orders: [],
      error: err instanceof Error ? err.message : 'تعذر تحميل الطلبات',
    };
  }
}

export async function fetchCourierCommissionPercentage(): Promise<number> {
  const DEFAULT_PERCENTAGE = 70;
  try {
    const {data, error} = await supabase
      .from('system_settings')
      .select('*')
      .limit(20);

    console.log('[Hatly Settings] system_settings query:', {data, error});

    if (error || !data || data.length === 0) {
      return DEFAULT_PERCENTAGE;
    }

    // 1. Column-based schema: system_settings.courier_commission_percentage
    for (const row of data as Record<string, unknown>[]) {
      if (row && row.courier_commission_percentage !== undefined && row.courier_commission_percentage !== null) {
        const parsed = Number(row.courier_commission_percentage);
        if (Number.isFinite(parsed) && parsed > 0 && parsed <= 100) {
          return parsed;
        }
      }
    }

    // 2. Key-value schema: key / setting_key / name === 'courier_commission_percentage'
    for (const row of data as Record<string, unknown>[]) {
      if (!row) continue;
      const k = String(row.key ?? row.setting_key ?? row.name ?? '').trim();
      if (k === 'courier_commission_percentage') {
        const parsed = Number(row.value ?? row.setting_value ?? row.numeric_value);
        if (Number.isFinite(parsed) && parsed > 0 && parsed <= 100) {
          return parsed;
        }
      }
    }

    return DEFAULT_PERCENTAGE;
  } catch (err) {
    console.log('[Hatly Settings] Fallback to default 70%:', err);
    return DEFAULT_PERCENTAGE;
  }
}

let resolvedDepositOrderCol: 'created_at' | 'deposit_date' | null = 'created_at';

export async function fetchCourierDeposits(
  courierId: string,
  options?: {alternateCourierIds?: Array<string | null | undefined>}
): Promise<{
  deposits: CourierDeposit[];
  error: string | null;
}> {
  try {
    const allIds = Array.from(
      new Set(
        [courierId, ...(options?.alternateCourierIds ?? [])].filter(
          (v): v is string => Boolean(v && String(v).trim())
        )
      )
    );
    if (allIds.length === 0) return {deposits: [], error: null};

    const runDepositQuery = async (orderCol: 'created_at' | 'deposit_date' | null) => {
      let q = supabase.from('courier_deposits').select('*');
      q = allIds.length > 1 ? q.in('courier_id', allIds) : q.eq('courier_id', allIds[0]);
      if (orderCol) {
        q = q.order(orderCol, {ascending: false});
      }
      return q;
    };

    let res = await runDepositQuery(resolvedDepositOrderCol);
    if (res.error && isColumnOrSchemaError(res.error.message, res.error.code)) {
      if (resolvedDepositOrderCol === 'created_at') {
        resolvedDepositOrderCol = 'deposit_date';
        res = await runDepositQuery('deposit_date');
      }
      if (res.error && isColumnOrSchemaError(res.error.message, res.error.code)) {
        resolvedDepositOrderCol = null;
        res = await runDepositQuery(null);
      }
    }

    if (res.error) {
      console.warn('[Hatly Deposits] Could not fetch deposits:', res.error.message);
      return {deposits: [], error: res.error.message};
    }

    const rows = Array.isArray(res.data) ? (res.data as CourierDeposit[]).filter(Boolean) : [];
    const normalized = rows
      .map((dep) => {
        const effectiveDate = dep.created_at || dep.deposit_date || new Date().toISOString();
        return {
          ...dep,
          amount: Number.isFinite(Number(dep.amount)) ? Number(dep.amount) : 0,
          receipt_url: dep.receipt_url || null,
          deposit_date: dep.deposit_date || null,
          created_at: effectiveDate,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.deposit_date || b.created_at).getTime() -
          new Date(a.deposit_date || a.created_at).getTime()
      );

    return {
      deposits: normalized,
      error: null,
    };
  } catch (err) {
    console.warn('[Hatly Deposits] Unexpected error fetching deposits:', err);
    return {
      deposits: [],
      error: err instanceof Error ? err.message : 'تعذر تحميل التوريدات',
    };
  }
}

export function calculateCustodyBalance(
  orders: CourierOrder[] | null | undefined,
  deposits: CourierDeposit[] | null | undefined
): number {
  const safeOrders = Array.isArray(orders) ? orders : [];
  const safeDeposits = Array.isArray(deposits) ? deposits : [];

  const totalCollectedCash = safeOrders.reduce((sum, order) => {
    if (!order) return sum;
    const isDelivered = order.status === 'delivered';
    const isCashMethod = String(order.paymentMethod ?? '').trim().toLowerCase() === 'cash';
    const isCollected = order.isCashCollected === true;
    if (isDelivered && isCashMethod && isCollected) {
      const amt = Number(order.totalAmount ?? 0);
      return sum + (Number.isFinite(amt) ? amt : 0);
    }
    return sum;
  }, 0);

  const totalDeposits = safeDeposits.reduce((sum, dep) => {
    if (!dep) return sum;
    const amt = Number(dep.amount ?? 0);
    return sum + (Number.isFinite(amt) ? amt : 0);
  }, 0);

  const result = totalCollectedCash - totalDeposits;
  return Number.isFinite(result) ? Math.max(0, Number(result.toFixed(2))) : 0;
}

export interface OrdersSummaryAndGroups {
  activeOrders: CourierOrder[];
  deliveredOrders: CourierOrder[];
  cancelledOrders: CourierOrder[];
  todayDeliveredCount: number;
  monthDeliveredCount: number;
}

function isDateOnSameLocalDay(dateStr: string | null | undefined, ref: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

function isDateInSameLocalMonth(dateStr: string | null | undefined, ref: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

export function summarizeAndFilterOrders(
  orders: CourierOrder[] | null | undefined,
  now: Date = new Date()
): OrdersSummaryAndGroups {
  const safeOrders = Array.isArray(orders) ? orders.filter(Boolean) : [];

  const activeOrders = safeOrders.filter(
    (o) =>
      o.status === 'assigned' ||
      o.status === 'confirmed_by_courier' ||
      o.status === 'accepted' ||
      o.status === 'on_the_way_to_pickup' ||
      o.status === 'picked_up' ||
      o.status === 'on_the_way'
  );
  const deliveredOrders = safeOrders.filter((o) => o.status === 'delivered');
  const cancelledOrders = safeOrders.filter((o) => o.status === 'cancelled');

  const todayDeliveredCount = deliveredOrders.filter((o) =>
    isDateOnSameLocalDay(o.deliveredAt || o.createdAt, now)
  ).length;

  const monthDeliveredCount = deliveredOrders.filter((o) =>
    isDateInSameLocalMonth(o.deliveredAt || o.createdAt, now)
  ).length;

  return {
    activeOrders,
    deliveredOrders,
    cancelledOrders,
    todayDeliveredCount,
    monthDeliveredCount,
  };
}

function getLocalDateYYYYMMDD(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isShiftWithinActiveWindow(
  shift: CourierShift,
  now: Date = new Date()
): boolean {
  const windowStart =
    shift.startDateTime.getTime() - SHIFT_CHECKIN_EARLY_MINUTES * 60 * 1000;
  const windowEnd = shift.endDateTime.getTime();
  return now.getTime() >= windowStart && now.getTime() <= windowEnd;
}

export function isShiftForToday(shift: CourierShift, now: Date = new Date()): boolean {
  const todayLocal = getLocalDateYYYYMMDD(now);
  const todayUtc = now.toISOString().slice(0, 10);
  const shiftDateStr = String(shift?.shiftDate ?? '').slice(0, 10);
  return shiftDateStr === todayLocal || shiftDateStr === todayUtc;
}

export interface ShiftAvailabilityResult {
  canGoOnline: boolean;
  forcedOnline: boolean;
  needsSelfieCheckIn: boolean;
  reason: 'forced_online' | 'active' | 'needs_selfie' | 'too_early' | 'ended' | 'no_shift';
  message: string | null;
  detailMessage: string | null;
  todayShift: CourierShift | null;
}

const STRICT_BLOCK_MESSAGE =
  'لا يمكنك بدء العمل حالياً. يرجى التأكد من موعد ورديتك وتصوير الزي.';

export function evaluateShiftAvailabilityWindow(
  shifts: CourierShift[] | null | undefined,
  now: Date = new Date(),
  options?: {forceOnline?: boolean}
): ShiftAvailabilityResult {
  const safeShifts = Array.isArray(shifts) ? shifts : [];
  const todayShifts = safeShifts
    .filter((s) => isShiftForToday(s, now) && s.status !== 'cancelled')
    .sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime());

  const activeWindowShift =
    todayShifts.find(
      (shift) =>
        isShiftWithinActiveWindow(shift, now) &&
        shift.status !== 'completed' &&
        !shift.checkOutTime
    ) ?? null;

  if (options?.forceOnline === true) {
    return {
      canGoOnline: true,
      forcedOnline: true,
      needsSelfieCheckIn: false,
      reason: 'forced_online',
      message: 'تم تفعيل حسابك بواسطة الإدارة.',
      detailMessage: null,
      todayShift: activeWindowShift ?? todayShifts[0] ?? null,
    };
  }

  if (todayShifts.length === 0) {
    return {
      canGoOnline: false,
      forcedOnline: false,
      needsSelfieCheckIn: false,
      reason: 'no_shift',
      message: STRICT_BLOCK_MESSAGE,
      detailMessage: 'لا توجد وردية مجدولة لك اليوم.',
      todayShift: null,
    };
  }

  if (activeWindowShift) {
    const hasSelfie = Boolean(
      activeWindowShift.checkInPhotoUrl && activeWindowShift.checkInPhotoUrl.trim().length > 0
    );

    if (!hasSelfie) {
      return {
        canGoOnline: false,
        forcedOnline: false,
        needsSelfieCheckIn: true,
        reason: 'needs_selfie',
        message: STRICT_BLOCK_MESSAGE,
        detailMessage: 'اضغط على «تصوير الزي وبدء الشيفت» لتفعيل العمل.',
        todayShift: activeWindowShift,
      };
    }

    return {
      canGoOnline: true,
      forcedOnline: false,
      needsSelfieCheckIn: false,
      reason: 'active',
      message: null,
      detailMessage: null,
      todayShift: activeWindowShift,
    };
  }

  const nowMs = now.getTime();
  const upcomingToday = todayShifts.find(
    (shift) =>
      nowMs < shift.startDateTime.getTime() - SHIFT_CHECKIN_EARLY_MINUTES * 60 * 1000
  );
  if (upcomingToday) {
    return {
      canGoOnline: false,
      forcedOnline: false,
      needsSelfieCheckIn: false,
      reason: 'too_early',
      message: STRICT_BLOCK_MESSAGE,
      detailMessage: 'لا يمكنك بدء العمل قبل موعد ورديتك المحدد.',
      todayShift: upcomingToday,
    };
  }

  return {
    canGoOnline: false,
    forcedOnline: false,
    needsSelfieCheckIn: false,
    reason: 'ended',
    message: STRICT_BLOCK_MESSAGE,
    detailMessage: 'انتهت ورديتك لهذا اليوم.',
    todayShift: todayShifts[todayShifts.length - 1] ?? null,
  };
}

export async function fetchCourierShifts(courierId: string): Promise<{
  shifts: CourierShift[];
  todayShifts: CourierShift[];
  error: string | null;
}> {
  try {
    if (!courierId) return {shifts: [], todayShifts: [], error: null};
    const now = new Date();
    const todayLocal = getLocalDateYYYYMMDD(now);
    const todayUtc = now.toISOString().slice(0, 10);

    console.log('[Hatly Shifts] Fetching courier_shifts:', {
      courierId,
      todayLocal,
      todayUtc,
      nowLocal: now.toString(),
    });

    // Query shifts for today specifically (CURRENT_DATE) as well as all shifts for history
    const todayDateFilters = Array.from(new Set([todayLocal, todayUtc]));
    const todayRes = await supabase
      .from('courier_shifts')
      .select('*')
      .eq('courier_id', courierId)
      .in('shift_date', todayDateFilters)
      .order('start_time', {ascending: true});

    console.log('[Hatly Shifts] Today query (shift_date = CURRENT_DATE):', {
      todayDateFilters,
      data: todayRes.data,
      error: todayRes.error,
    });

    const allRes = await supabase
      .from('courier_shifts')
      .select('*')
      .eq('courier_id', courierId)
      .order('start_time', {ascending: true});

    console.log('[Hatly Shifts] All courier_shifts raw response:', {
      data: allRes.data,
      error: allRes.error,
    });

    const mergedMap = new Map<string, RawShiftRow>();
    if (Array.isArray(allRes.data)) {
      for (const r of allRes.data as RawShiftRow[]) {
        if (r?.id) mergedMap.set(String(r.id), r);
      }
    }
    if (Array.isArray(todayRes.data)) {
      for (const r of todayRes.data as RawShiftRow[]) {
        if (r?.id) mergedMap.set(String(r.id), r);
      }
    }
    const rawRows = Array.from(mergedMap.values());

    const fetchError = allRes.error?.message || todayRes.error?.message || null;
    if (fetchError && rawRows.length === 0) {
      return {shifts: [], todayShifts: [], error: fetchError};
    }

    const normalized = rawRows.filter(Boolean).map(normalizeShift);

    // Sync missed or completed shifts automatically when their end time has passed
    const missedIds: string[] = [];
    const completedIds: string[] = [];

    const updatedShifts = normalized.map((shift) => {
      const isToday = isShiftForToday(shift, now);
      if (now.getTime() > shift.endDateTime.getTime() && !isToday) {
        if (!shift.checkInTime && shift.status === 'scheduled' && shift.id) {
          missedIds.push(shift.id);
          return {...shift, status: 'missed' as ShiftStatus};
        }
        if (shift.checkInTime && (shift.status === 'active' || shift.status === 'late') && shift.id) {
          completedIds.push(shift.id);
          return {...shift, status: 'completed' as ShiftStatus};
        }
      }
      return shift;
    });

    if (missedIds.length > 0) {
      await supabase
        .from('courier_shifts')
        .update({status: 'missed'})
        .in('id', missedIds);
    }

    if (completedIds.length > 0) {
      await supabase
        .from('courier_shifts')
        .update({status: 'completed'})
        .in('id', completedIds);
    }

    updatedShifts.sort(
      (a, b) => b.startDateTime.getTime() - a.startDateTime.getTime()
    );

    const todayShifts = updatedShifts.filter((s) => isShiftForToday(s, now));
    console.log('[Hatly Shifts] Normalized shifts:', {
      totalCount: updatedShifts.length,
      todayCount: todayShifts.length,
      todayShifts,
    });

    return {shifts: updatedShifts, todayShifts, error: null};
  } catch (err) {
    console.error('[Hatly Shifts] Unexpected error fetching shifts:', err);
    return {
      shifts: [],
      todayShifts: [],
      error: err instanceof Error ? err.message : 'تعذر تحميل الورديات',
    };
  }
}

export function formatEGP(value: number | null | undefined): string {
  const num = Number(value ?? 0);
  const safe = Number.isFinite(num) ? num : 0;
  try {
    return new Intl.NumberFormat('ar-EG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
  } catch {
    return safe.toFixed(2);
  }
}

export function formatDateArabic(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('ar-EG', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return '—';
  }
}

export function formatShiftDateArabic(dateObj: Date | null | undefined): string {
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) {
    return '—';
  }
  try {
    return new Intl.DateTimeFormat('ar-EG', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(dateObj);
  } catch {
    return dateObj.toLocaleDateString('ar-EG');
  }
}

export function formatShiftTimeArabic(dateObj: Date | null | undefined): string {
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) {
    return '—';
  }
  try {
    return new Intl.DateTimeFormat('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(dateObj);
  } catch {
    return dateObj.toLocaleTimeString('ar-EG');
  }
}

export function formatDurationHMS(ms: number): string {
  const safeMs = Number.isFinite(ms) ? ms : 0;
  const safeSeconds = Math.max(0, Math.floor(safeMs / 1000));
  const hrs = Math.floor(safeSeconds / 3600);
  const mins = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;
  return [hrs, mins, secs].map((v) => String(v).padStart(2, '0')).join(':');
}

export function getLocalDateKey(d: Date = new Date()): string {
  return getLocalDateYYYYMMDD(d);
}

export function formatDayNameArabic(dateObj: Date): string {
  try {
    return new Intl.DateTimeFormat('ar-EG', {weekday: 'long'}).format(dateObj);
  } catch {
    const names = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    return names[dateObj.getDay()] ?? '';
  }
}

export function formatShortDateArabic(dateObj: Date): string {
  try {
    return new Intl.DateTimeFormat('ar-EG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(dateObj);
  } catch {
    return dateObj.toLocaleDateString('ar-EG');
  }
}

export function formatTimeFromIsoArabic(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return '—';
  }
}

export function formatMinutesArabic(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(Number.isFinite(totalMinutes) ? totalMinutes : 0));
  if (mins === 0) return '0 دقيقة';
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs === 0) return `${rem} دقيقة`;
  if (rem === 0) return `${hrs} ساعة`;
  return `${hrs} س ${rem} د`;
}

export function getWeekDaysStartingSaturday(anchorDate: Date = new Date(), weekOffset: number = 0): Date[] {
  const base = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate());
  // JS getDay(): 0=Sun, 1=Mon, ..., 6=Sat. Offset to most recent Saturday:
  const diffFromSaturday = (base.getDay() + 1) % 7;
  const saturday = new Date(base);
  saturday.setDate(base.getDate() - diffFromSaturday + weekOffset * 7);

  return Array.from({length: 7}, (_, idx) => {
    const d = new Date(saturday);
    d.setDate(saturday.getDate() + idx);
    return d;
  });
}

function getShiftEventsStorageKey(courierId: string): string {
  return `hatly_shift_events_${courierId}`;
}

export function loadShiftStatusEvents(courierId: string): ShiftStatusEvent[] {
  if (!courierId || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(getShiftEventsStorageKey(courierId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is ShiftStatusEvent => Boolean(item && item.timestamp && item.status))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  } catch {
    return [];
  }
}

export function recordShiftStatusEvent(
  courierId: string,
  event: Omit<ShiftStatusEvent, 'id' | 'courierId' | 'dateKey'> & {dateKey?: string}
): ShiftStatusEvent[] {
  if (!courierId || typeof window === 'undefined') return [];
  const existing = loadShiftStatusEvents(courierId);
  const tsDate = new Date(event.timestamp);
  const dateKey =
    event.dateKey ||
    (Number.isNaN(tsDate.getTime()) ? getLocalDateYYYYMMDD(new Date()) : getLocalDateYYYYMMDD(tsDate));

  const nextEvent: ShiftStatusEvent = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    courierId,
    shiftId: event.shiftId ?? null,
    dateKey,
    status: event.status,
    reason: event.reason ?? 'toggle',
    timestamp: event.timestamp,
  };

  // Keep up to last 400 events (~2+ months)
  const updated = [...existing, nextEvent].slice(-400);
  try {
    window.localStorage.setItem(getShiftEventsStorageKey(courierId), JSON.stringify(updated));
  } catch {
    // ignore quota errors
  }
  return updated;
}

export interface DayTimelineEntry {
  id: string;
  status: 'online' | 'offline';
  label: string;
  timestamp: string;
}

export interface WeeklyDaySchedule {
  dateKey: string;
  date: Date;
  dayName: string;
  shortDate: string;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  shift: CourierShift | null;
  scheduledTimeLabel: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  offlineMinutes: number;
  deliveredOrdersCount: number;
  currentOrFinalStatus: 'online' | 'offline';
  timeline: DayTimelineEntry[];
}

export function computeShiftOfflineMinutes(params: {
  shift: CourierShift | null;
  dayEvents: ShiftStatusEvent[];
  checkInTime: string | null;
  checkOutTime: string | null;
  isToday: boolean;
  courierStatus: 'online' | 'offline';
  now: Date;
}): number {
  const {shift, dayEvents, checkInTime, checkOutTime, isToday, courierStatus, now} = params;
  if (!shift) return 0;

  const nowMs = now.getTime();
  const shiftStartMs = shift.startDateTime.getTime();
  const shiftEndMs = shift.endDateTime.getTime();

  // Future shift hasn't started yet
  if (nowMs <= shiftStartMs) {
    return 0;
  }

  const effectiveEndMs = Math.min(shiftEndMs, nowMs);
  if (effectiveEndMs <= shiftStartMs) return 0;

  // If missed or never checked in yet during/after shift
  if (!checkInTime) {
    if (shift.status === 'missed' || nowMs > shiftStartMs) {
      return Math.max(0, Math.round((effectiveEndMs - shiftStartMs) / 60000));
    }
    return 0;
  }

  const checkInMs = new Date(checkInTime).getTime();
  if (Number.isNaN(checkInMs)) return 0;

  const checkOutMs = checkOutTime ? new Date(checkOutTime).getTime() : null;
  const hasValidCheckOut = checkOutMs !== null && !Number.isNaN(checkOutMs);

  let offlineMs = 0;

  // 1. Late start inside scheduled shift window
  if (checkInMs > shiftStartMs) {
    offlineMs += Math.min(checkInMs, effectiveEndMs) - shiftStartMs;
  }

  // 2. Early check-out inside scheduled shift window
  const activeWindowStart = Math.max(shiftStartMs, checkInMs);
  const activeWindowEnd = hasValidCheckOut
    ? Math.min(effectiveEndMs, checkOutMs as number)
    : effectiveEndMs;

  if (hasValidCheckOut && (checkOutMs as number) < effectiveEndMs) {
    offlineMs += effectiveEndMs - Math.max(shiftStartMs, checkOutMs as number);
  }

  // 3. Offline toggle gaps during [activeWindowStart, activeWindowEnd]
  if (activeWindowEnd > activeWindowStart) {
    const sorted = [...dayEvents]
      .filter((e) => {
        const t = new Date(e.timestamp).getTime();
        return !Number.isNaN(t) && t <= activeWindowEnd;
      })
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Initial state at activeWindowStart: online right after check-in unless an earlier toggle overrode it
    let currentState: 'online' | 'offline' = 'online';
    let cursor = activeWindowStart;

    for (const ev of sorted) {
      const evTime = new Date(ev.timestamp).getTime();
      if (evTime <= activeWindowStart) {
        currentState = ev.status;
        continue;
      }
      if (currentState === 'offline') {
        offlineMs += evTime - cursor;
      }
      currentState = ev.status;
      cursor = evTime;
    }

    // If still active today and courier is currently offline without a recorded toggle event, or last event was offline:
    if (currentState === 'offline') {
      offlineMs += activeWindowEnd - cursor;
    } else if (
      isToday &&
      !hasValidCheckOut &&
      courierStatus === 'offline' &&
      sorted.length === 0
    ) {
      // No toggle timestamps recorded yet, fallback conservatively without fabricating huge intervals
      offlineMs += 0;
    }
  }

  const computedMinutes = Math.max(0, Math.round(offlineMs / 60000));
  if (computedMinutes === 0 && typeof shift.offlineMinutes === 'number' && shift.offlineMinutes > 0) {
    return shift.offlineMinutes;
  }
  return computedMinutes;
}

export function buildWeeklyScheduleDays(params: {
  weekDays: Date[];
  shifts: CourierShift[];
  orders: {status: string; deliveredAt: string | null; createdAt: string}[];
  events: ShiftStatusEvent[];
  courierStatus: 'online' | 'offline';
  now?: Date;
}): WeeklyDaySchedule[] {
  const {weekDays, shifts, orders, events, courierStatus, now = new Date()} = params;
  const todayKey = getLocalDateYYYYMMDD(now);

  return weekDays.map((date) => {
    const dateKey = getLocalDateYYYYMMDD(date);
    const isToday = dateKey === todayKey;
    const isPast = dateKey < todayKey;
    const isFuture = dateKey > todayKey;

    const dayShift =
      shifts.find((s) => {
        const shiftDateKey = String(s.shiftDate || '').slice(0, 10);
        const startKey = getLocalDateYYYYMMDD(s.startDateTime);
        return shiftDateKey === dateKey || startKey === dateKey;
      }) ?? null;

    const dayEvents = events
      .filter((e) => {
        if (dayShift && e.shiftId && e.shiftId === dayShift.id) return true;
        return e.dateKey === dateKey;
      })
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const checkInEvent = dayEvents.find((e) => e.reason === 'check_in');
    const checkOutEvent = [...dayEvents].reverse().find((e) => e.reason === 'check_out');

    const checkInTime = dayShift?.checkInTime || checkInEvent?.timestamp || null;
    const checkOutTime = dayShift?.checkOutTime || checkOutEvent?.timestamp || null;

    const offlineMinutes = computeShiftOfflineMinutes({
      shift: dayShift,
      dayEvents,
      checkInTime,
      checkOutTime,
      isToday,
      courierStatus,
      now,
    });

    const deliveredOrdersCount = orders.filter((order) => {
      if (order.status !== 'delivered') return false;
      const tsStr = order.deliveredAt || order.createdAt;
      if (!tsStr) return false;
      const ts = new Date(tsStr);
      if (Number.isNaN(ts.getTime())) return false;
      if (dayShift) {
        const winStart =
          Math.min(
            dayShift.startDateTime.getTime(),
            checkInTime ? new Date(checkInTime).getTime() : dayShift.startDateTime.getTime()
          ) -
          30 * 60 * 1000;
        const winEnd =
          Math.max(
            dayShift.endDateTime.getTime(),
            checkOutTime ? new Date(checkOutTime).getTime() : dayShift.endDateTime.getTime()
          ) +
          2 * 60 * 60 * 1000;
        if (ts.getTime() >= winStart && ts.getTime() <= winEnd) return true;
      }
      return getLocalDateYYYYMMDD(ts) === dateKey;
    }).length;

    const timeline: DayTimelineEntry[] = [];
    if (checkInTime) {
      const alreadyHasCheckIn = dayEvents.some((e) => e.reason === 'check_in');
      if (!alreadyHasCheckIn) {
        timeline.push({
          id: `checkin-${dateKey}`,
          status: 'online',
          label: 'تسجيل الحضور (بدء الشيفت)',
          timestamp: checkInTime,
        });
      }
    }

    for (const ev of dayEvents) {
      let label = ev.status === 'online' ? 'متصل للعمل' : 'غير متصل';
      if (ev.reason === 'check_in') label = 'تسجيل الحضور (بدء الشيفت)';
      if (ev.reason === 'check_out') label = 'تسجيل الانصراف (إنهاء الشيفت)';
      timeline.push({
        id: ev.id,
        status: ev.status,
        label,
        timestamp: ev.timestamp,
      });
    }

    if (checkOutTime && !dayEvents.some((e) => e.reason === 'check_out')) {
      timeline.push({
        id: `checkout-${dateKey}`,
        status: 'offline',
        label: 'تسجيل الانصراف (إنهاء الشيفت)',
        timestamp: checkOutTime,
      });
    }

    timeline.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const lastTimeline = timeline[timeline.length - 1];
    const currentOrFinalStatus: 'online' | 'offline' = isToday
      ? courierStatus
      : lastTimeline
        ? lastTimeline.status
        : 'offline';

    const scheduledTimeLabel = dayShift
      ? `${formatShiftTimeArabic(dayShift.startDateTime)} - ${formatShiftTimeArabic(
          dayShift.endDateTime
        )}`
      : 'لا توجد وردية مجدولة';

    return {
      dateKey,
      date,
      dayName: formatDayNameArabic(date),
      shortDate: formatShortDateArabic(date),
      isToday,
      isPast,
      isFuture,
      shift: dayShift,
      scheduledTimeLabel,
      checkInTime,
      checkOutTime,
      offlineMinutes,
      deliveredOrdersCount,
      currentOrFinalStatus,
      timeline,
    };
  });
}

export async function endCourierShiftRecord(params: {
  shift: CourierShift | null;
  profileId: string;
  nowIso: string;
  offlineMinutes?: number;
}): Promise<{error: string | null}> {
  const {shift, profileId, nowIso, offlineMinutes} = params;

  if (shift?.id) {
    // Update check_out_time + status first; try offline_minutes opportunistically
    const basePayload: Record<string, unknown> = {
      check_out_time: nowIso,
      status: 'completed',
    };

    const withOfflinePayload: Record<string, unknown> =
      typeof offlineMinutes === 'number'
        ? {...basePayload, offline_minutes: offlineMinutes}
        : basePayload;

    let {error: shiftErr} = await supabase
      .from('courier_shifts')
      .update(withOfflinePayload)
      .eq('id', shift.id);

    if (shiftErr && typeof offlineMinutes === 'number') {
      // Fallback in case offline_minutes column is not present in schema
      const retry = await supabase
        .from('courier_shifts')
        .update(basePayload)
        .eq('id', shift.id);
      shiftErr = retry.error;
    }

    if (shiftErr) {
      // Fallback if check_out_time column is absent in an older schema: still mark completed
      const retryStatus = await supabase
        .from('courier_shifts')
        .update({status: 'completed'})
        .eq('id', shift.id);
      if (retryStatus.error) {
        return {error: retryStatus.error.message};
      }
    }
  }

  const {error: courierErr} = await supabase
    .from('couriers')
    .update({status: 'offline'})
    .eq('profile_id', profileId);

  if (courierErr) {
    return {error: courierErr.message};
  }

  return {error: null};
}

export async function acceptAssignedOrderRecord(orderId: string): Promise<{
  nextStatus: OrderStatus;
  error: string | null;
}> {
  if (!orderId) {
    return {nextStatus: 'assigned', error: 'معرف الطلب غير صالح'};
  }

  console.log('[Hatly Orders] Accepting order:', {orderId, targetStatus: 'confirmed_by_courier'});

  const res = await supabase
    .from('orders')
    .update({status: 'confirmed_by_courier'})
    .eq('id', orderId);

  if (!res.error) {
    setOrderLocallyAccepted(orderId, false);
    return {nextStatus: 'confirmed_by_courier', error: null};
  }

  console.warn('[Hatly Orders] Accept confirmed_by_courier failed:', res.error);
  const msg = res.error.message.toLowerCase();
  const isConstraintOrPolicy =
    msg.includes('check') ||
    msg.includes('enum') ||
    msg.includes('constraint') ||
    msg.includes('row-level security');

  if (isConstraintOrPolicy) {
    const fallback = await supabase
      .from('orders')
      .update({status: 'accepted'})
      .eq('id', orderId);
    if (!fallback.error) {
      setOrderLocallyAccepted(orderId, false);
      return {nextStatus: 'accepted', error: null};
    }

    // Some RLS/check policies require status to remain 'assigned' until pickup
    const keepAssigned = await supabase
      .from('orders')
      .update({status: 'assigned'})
      .eq('id', orderId);
    if (!keepAssigned.error) {
      setOrderLocallyAccepted(orderId, true);
      return {nextStatus: 'confirmed_by_courier', error: null};
    }

    return {nextStatus: 'assigned', error: fallback.error.message};
  }

  return {nextStatus: 'assigned', error: res.error.message};
}

function isRlsPolicyError(errMsg: string | undefined, errCode?: string): boolean {
  const msg = String(errMsg ?? '').toLowerCase();
  const code = String(errCode ?? '').toUpperCase();
  return (
    code === '42501' ||
    msg.includes('row-level security') ||
    msg.includes('violates row-level security')
  );
}

export async function rejectAssignedOrderRecord(
  order: CourierOrder,
  courierId: string
): Promise<{error: string | null}> {
  if (!order?.id) {
    return {error: 'معرف الطلب غير صالح'};
  }

  const currentRejected: string[] = Array.isArray(order.rejectedByCouriers)
    ? order.rejectedByCouriers.map(String)
    : [];
  const nextRejected = Array.from(new Set([...currentRejected, courierId].filter(Boolean)));

  console.log('[Hatly Orders] Rejecting order:', {
    orderId: order.id,
    courierId,
    nextRejected,
  });

  // Ordered payloads:
  // 1. Standard reject (status='new', courier_id=null, rejected_by_couriers)
  // 2. If RLS WITH CHECK requires courier_id to remain unchanged, update status='new' + rejected_by_couriers
  // 3. If RLS WITH CHECK restricts status changes, update rejected_by_couriers only
  // 4. Schema-safe fallbacks if rejected_by_couriers column is absent
  const attemptPayloads: Record<string, unknown>[] = [
    {status: 'new', courier_id: null, rejected_by_couriers: nextRejected},
    {status: 'new', courier_id: null},
    {status: 'new', rejected_by_couriers: nextRejected},
    {rejected_by_couriers: nextRejected},
    {status: 'new'},
  ];

  let lastError: {message: string; code?: string} | null = null;
  let schemaSupportsRejectedCol = true;
  let rlsBlocksUnassignCourier = false;

  for (const payload of attemptPayloads) {
    if (!schemaSupportsRejectedCol && 'rejected_by_couriers' in payload) {
      continue;
    }
    if (rlsBlocksUnassignCourier && 'courier_id' in payload && payload.courier_id === null) {
      continue;
    }

    const res = await supabase
      .from('orders')
      .update(payload)
      .eq('id', order.id);

    if (!res.error) {
      setOrderLocallyAccepted(order.id, false);
      setOrderLocallyPickupEnroute(order.id, false);
      return {error: null};
    }

    lastError = res.error;

    if (isColumnOrSchemaError(res.error.message, res.error.code)) {
      if ('rejected_by_couriers' in payload) {
        schemaSupportsRejectedCol = false;
      }
      continue;
    }

    if (isRlsPolicyError(res.error.message, res.error.code)) {
      if ('courier_id' in payload && payload.courier_id === null) {
        rlsBlocksUnassignCourier = true;
      }
      console.warn('[Hatly Orders] Reject payload blocked by RLS WITH CHECK, trying fallback:', {
        payloadKeys: Object.keys(payload),
        message: res.error.message,
      });
      continue;
    }

    break;
  }

  if (lastError) {
    console.warn('[Hatly Orders] Reject order could not complete:', lastError);
    if (isRlsPolicyError(lastError.message, lastError.code)) {
      return {
        error:
          'صلاحيات الأمان في قاعدة البيانات (RLS) تمنع رفض الطلب حالياً. يرجى السماح للمندوب بتحديث rejected_by_couriers أو إرجاع الطلب إلى new في سياسة orders.',
      };
    }
    return {error: lastError.message};
  }

  return {error: 'تعذر رفض الطلب'};
}

const ACCEPTED_ORDER_STORAGE_KEY = 'hatly_accepted_order_ids';
const PICKUP_ENROUTE_STORAGE_KEY = 'hatly_pickup_enroute_order_ids';

export function isOrderLocallyAccepted(orderId: string): boolean {
  if (!orderId || typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(ACCEPTED_ORDER_STORAGE_KEY);
    if (!raw) return false;
    const ids = JSON.parse(raw);
    return Array.isArray(ids) && ids.includes(orderId);
  } catch {
    return false;
  }
}

export function setOrderLocallyAccepted(orderId: string, active: boolean): void {
  if (!orderId || typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(ACCEPTED_ORDER_STORAGE_KEY);
    const current: string[] = raw && Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
    const next = active
      ? Array.from(new Set([...current, orderId]))
      : current.filter((id) => id !== orderId);
    window.localStorage.setItem(ACCEPTED_ORDER_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}

export function isOrderLocallyPickupEnroute(orderId: string): boolean {
  if (!orderId || typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(PICKUP_ENROUTE_STORAGE_KEY);
    if (!raw) return false;
    const ids = JSON.parse(raw);
    return Array.isArray(ids) && ids.includes(orderId);
  } catch {
    return false;
  }
}

export function setOrderLocallyPickupEnroute(orderId: string, active: boolean): void {
  if (!orderId || typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(PICKUP_ENROUTE_STORAGE_KEY);
    const current: string[] = raw && Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
    const next = active
      ? Array.from(new Set([...current, orderId]))
      : current.filter((id) => id !== orderId);
    window.localStorage.setItem(PICKUP_ENROUTE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}

export interface QueuedStatusUpdate {
  id: string;
  type: 'order_status' | 'accept_order' | 'courier_availability';
  orderId?: string;
  status: string;
  payload?: Record<string, unknown>;
  profileId?: string;
  createdAt: string;
}

const OFFLINE_QUEUE_STORAGE_KEY = 'hatly_offline_status_queue';
export const OFFLINE_QUEUE_EVENT = 'hatly-offline-queue-change';

export function isLikelyOfflineError(msgOrErr: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const text =
    typeof msgOrErr === 'string'
      ? msgOrErr
      : msgOrErr instanceof Error
        ? msgOrErr.message
        : '';
  const lower = text.toLowerCase();
  return (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('load failed') ||
    lower.includes('err_internet_disconnected')
  );
}

function notifyOfflineQueueChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OFFLINE_QUEUE_EVENT));
  }
}

export function loadOfflineStatusQueue(): QueuedStatusUpdate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedStatusUpdate[]) : [];
  } catch {
    return [];
  }
}

function saveOfflineStatusQueue(queue: QueuedStatusUpdate[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(queue));
    notifyOfflineQueueChanged();
  } catch {
    // ignore quota errors
  }
}

export function enqueueOfflineStatusUpdate(
  item: Omit<QueuedStatusUpdate, 'id' | 'createdAt'>
): QueuedStatusUpdate[] {
  const current = loadOfflineStatusQueue();
  const nextItem: QueuedStatusUpdate = {
    ...item,
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };

  // Deduplicate same courier_availability target or keep chronological order updates
  const filtered =
    item.type === 'courier_availability'
      ? current.filter((q) => q.type !== 'courier_availability')
      : current;

  const updated = [...filtered, nextItem];
  saveOfflineStatusQueue(updated);
  return updated;
}

let activeFlushPromise: Promise<{
  syncedCount: number;
  failedCount: number;
  remaining: QueuedStatusUpdate[];
}> | null = null;

export function flushOfflineStatusQueue(): Promise<{
  syncedCount: number;
  failedCount: number;
  remaining: QueuedStatusUpdate[];
}> {
  if (activeFlushPromise) {
    return activeFlushPromise;
  }

  activeFlushPromise = (async () => {
    const queue = loadOfflineStatusQueue();
    if (queue.length === 0) {
      return {syncedCount: 0, failedCount: 0, remaining: []};
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return {syncedCount: 0, failedCount: queue.length, remaining: queue};
    }

    const processedIds = new Set<string>(queue.map((q) => q.id));
    let syncedCount = 0;
    const remaining: QueuedStatusUpdate[] = [];

    for (let i = 0; i < queue.length; i += 1) {
      const item = queue[i];
      try {
        if (item.type === 'accept_order' && item.orderId) {
          const res = await acceptAssignedOrderRecord(item.orderId);
          if (res.error) {
            if (isLikelyOfflineError(res.error)) {
              remaining.push(...queue.slice(i));
              break;
            }
          } else {
            syncedCount += 1;
          }
        } else if (item.type === 'order_status' && item.orderId) {
          const updatePayload = item.payload || {status: item.status};
          const {error} = await supabase
            .from('orders')
            .update(updatePayload)
            .eq('id', item.orderId);

          if (error) {
            if (isLikelyOfflineError(error.message)) {
              remaining.push(...queue.slice(i));
              break;
            }
            const lower = error.message.toLowerCase();
            if (
              item.status === 'on_the_way_to_pickup' &&
              (lower.includes('check') || lower.includes('enum') || lower.includes('constraint'))
            ) {
              setOrderLocallyPickupEnroute(item.orderId, true);
              syncedCount += 1;
            }
          } else {
            setOrderLocallyPickupEnroute(item.orderId, false);
            syncedCount += 1;
          }
        } else if (item.type === 'courier_availability' && item.profileId) {
          const {error} = await supabase
            .from('couriers')
            .update({status: item.status})
            .eq('profile_id', item.profileId);

          if (error) {
            if (isLikelyOfflineError(error.message)) {
              remaining.push(...queue.slice(i));
              break;
            }
          } else {
            syncedCount += 1;
          }
        }
      } catch (err) {
        if (isLikelyOfflineError(err)) {
          remaining.push(...queue.slice(i));
          break;
        }
      }
    }

    // Preserve any updates enqueued while the flush was in flight
    const midFlushAdditions = loadOfflineStatusQueue().filter(
      (q) => !processedIds.has(q.id)
    );
    const finalRemaining = [...remaining, ...midFlushAdditions];
    saveOfflineStatusQueue(finalRemaining);
    return {syncedCount, failedCount: finalRemaining.length, remaining: finalRemaining};
  })().finally(() => {
    activeFlushPromise = null;
  });

  return activeFlushPromise;
}

export interface NotificationTargetIds {
  courierId: string;
  profileId?: string | null;
  userId?: string | null;
}

export type NotificationTargetInput = string | NotificationTargetIds;

type NotificationOwnerCol = 'user_id' | 'courier_id' | 'profile_id' | 'recipient_id';
type NotificationReadCol = 'is_read' | 'read';
type NotificationMsgCol = 'message' | 'body' | 'content';

interface ResolvedNotifSchema {
  tableAvailable: boolean;
  ownerCol: NotificationOwnerCol | null;
  readCol: NotificationReadCol | null;
  msgCol: NotificationMsgCol;
  hasTypeCol: boolean;
  hasOrderIdCol: boolean;
  hasCreatedAtCol: boolean;
}

const NOTIF_SCHEMA_CACHE_KEY = 'hatly_notif_schema_v1';
let resolvedNotifSchema: ResolvedNotifSchema | null = null;
let resolvingNotifSchemaPromise: Promise<ResolvedNotifSchema> | null = null;

function isNotificationTableMissingError(errMsg: string | undefined, errCode?: string): boolean {
  const msg = String(errMsg ?? '').toLowerCase();
  const code = String(errCode ?? '').toUpperCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    (msg.includes('relation') && msg.includes('does not exist')) ||
    msg.includes('could not find the table')
  );
}

function loadCachedNotifSchema(): ResolvedNotifSchema | null {
  if (resolvedNotifSchema) return resolvedNotifSchema;
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(NOTIF_SCHEMA_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ResolvedNotifSchema>;
    if (typeof parsed.tableAvailable !== 'boolean') return null;
    resolvedNotifSchema = {
      tableAvailable: parsed.tableAvailable,
      ownerCol: parsed.ownerCol ?? null,
      readCol: parsed.readCol ?? null,
      msgCol: parsed.msgCol ?? 'message',
      hasTypeCol: Boolean(parsed.hasTypeCol ?? true),
      hasOrderIdCol: Boolean(parsed.hasOrderIdCol ?? true),
      hasCreatedAtCol: Boolean(parsed.hasCreatedAtCol ?? true),
    };
    return resolvedNotifSchema;
  } catch {
    return null;
  }
}

function saveCachedNotifSchema(schema: ResolvedNotifSchema): void {
  resolvedNotifSchema = schema;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(NOTIF_SCHEMA_CACHE_KEY, JSON.stringify(schema));
  } catch {
    // ignore storage errors
  }
}

function clearCachedNotifSchema(): void {
  resolvedNotifSchema = null;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(NOTIF_SCHEMA_CACHE_KEY);
  } catch {
    // ignore
  }
}

function normalizeNotificationTargets(target: NotificationTargetInput): NotificationTargetIds {
  if (typeof target === 'string') {
    return {courierId: target};
  }
  return {
    courierId: target.courierId || '',
    profileId: target.profileId || null,
    userId: target.userId || null,
  };
}

function getCandidateIdsForColumn(
  col: NotificationOwnerCol,
  targets: NotificationTargetIds
): string[] {
  const ordered =
    col === 'user_id' || col === 'profile_id'
      ? [targets.profileId, targets.userId, targets.courierId]
      : [targets.courierId, targets.profileId, targets.userId];
  return Array.from(new Set(ordered.filter((v): v is string => Boolean(v && String(v).trim()))));
}

function getPrimaryOwnerValue(
  col: NotificationOwnerCol,
  targets: NotificationTargetIds
): string {
  const ids = getCandidateIdsForColumn(col, targets);
  return ids[0] || targets.courierId;
}

function deriveSchemaFromSampleRow(sample: Record<string, unknown>): ResolvedNotifSchema {
  const ownerCol: NotificationOwnerCol | null =
    'courier_id' in sample
      ? 'courier_id'
      : 'user_id' in sample
        ? 'user_id'
        : 'profile_id' in sample
          ? 'profile_id'
          : 'recipient_id' in sample
            ? 'recipient_id'
            : null;

  const readCol: NotificationReadCol | null =
    'is_read' in sample ? 'is_read' : 'read' in sample ? 'read' : null;

  const msgCol: NotificationMsgCol =
    'message' in sample
      ? 'message'
      : 'body' in sample
        ? 'body'
        : 'content' in sample
          ? 'content'
          : 'message';

  return {
    tableAvailable: true,
    ownerCol,
    readCol,
    msgCol,
    hasTypeCol: 'type' in sample,
    hasOrderIdCol: 'order_id' in sample,
    hasCreatedAtCol: 'created_at' in sample,
  };
}

async function resolveNotificationSchema(
  targets: NotificationTargetIds,
  forceRefresh = false
): Promise<ResolvedNotifSchema> {
  if (!forceRefresh) {
    const cached = loadCachedNotifSchema();
    if (cached) return cached;
  } else {
    clearCachedNotifSchema();
  }

  if (resolvingNotifSchemaPromise && !forceRefresh) {
    return resolvingNotifSchemaPromise;
  }

  resolvingNotifSchemaPromise = (async (): Promise<ResolvedNotifSchema> => {
    try {
      // Step 1: Select 1 row without filtering by courier_id so PostgREST never returns 42703
      const inspectRes = await supabase.from('notifications').select('*').limit(1);

      if (inspectRes.error) {
        if (isNotificationTableMissingError(inspectRes.error.message, inspectRes.error.code)) {
          const unavailable: ResolvedNotifSchema = {
            tableAvailable: false,
            ownerCol: null,
            readCol: null,
            msgCol: 'message',
            hasTypeCol: false,
            hasOrderIdCol: false,
            hasCreatedAtCol: false,
          };
          saveCachedNotifSchema(unavailable);
          return unavailable;
        }
      } else if (Array.isArray(inspectRes.data) && inspectRes.data.length > 0 && inspectRes.data[0]) {
        const derived = deriveSchemaFromSampleRow(inspectRes.data[0] as Record<string, unknown>);
        saveCachedNotifSchema(derived);
        return derived;
      }

      // Step 2: Table exists but returned 0 rows — probe owner columns in safest order (user_id first)
      const candidates: NotificationOwnerCol[] = [
        'user_id',
        'profile_id',
        'courier_id',
        'recipient_id',
      ];
      let detectedOwnerCol: NotificationOwnerCol | null = null;

      for (const col of candidates) {
        const probeVal = getPrimaryOwnerValue(col, targets);
        if (!probeVal) continue;
        const probe = await supabase
          .from('notifications')
          .select('id')
          .eq(col, probeVal)
          .limit(1);

        if (!probe.error) {
          detectedOwnerCol = col;
          break;
        }
        if (isNotificationTableMissingError(probe.error.message, probe.error.code)) {
          const unavailable: ResolvedNotifSchema = {
            tableAvailable: false,
            ownerCol: null,
            readCol: null,
            msgCol: 'message',
            hasTypeCol: false,
            hasOrderIdCol: false,
            hasCreatedAtCol: false,
          };
          saveCachedNotifSchema(unavailable);
          return unavailable;
        }
        if (!isColumnOrSchemaError(probe.error.message, probe.error.code)) {
          break;
        }
      }

      const fallbackSchema: ResolvedNotifSchema = {
        tableAvailable: true,
        ownerCol: detectedOwnerCol,
        readCol: null,
        msgCol: 'message',
        hasTypeCol: true,
        hasOrderIdCol: true,
        hasCreatedAtCol: true,
      };
      saveCachedNotifSchema(fallbackSchema);
      return fallbackSchema;
    } finally {
      resolvingNotifSchemaPromise = null;
    }
  })();

  return resolvingNotifSchemaPromise;
}

export function normalizeNotification(row: RawNotificationRow): CourierNotification {
  const ownerId =
    row?.courier_id ?? row?.user_id ?? row?.profile_id ?? row?.recipient_id ?? '';
  const readVal =
    typeof row?.is_read === 'boolean'
      ? row.is_read
      : typeof row?.read === 'boolean'
        ? row.read
        : Boolean(row?.is_read ?? row?.read);

  return {
    id: String(row?.id ?? ''),
    courierId: String(ownerId ?? ''),
    title: String(row?.title ?? 'إشعار جديد'),
    message: String(row?.message ?? row?.body ?? row?.content ?? ''),
    type: row?.type ? String(row.type) : null,
    orderId: row?.order_id ? String(row.order_id) : null,
    isRead: readVal,
    createdAt: row?.created_at || new Date().toISOString(),
  };
}

export async function fetchCourierNotifications(
  target: NotificationTargetInput
): Promise<{
  notifications: CourierNotification[];
  error: string | null;
}> {
  try {
    const targets = normalizeNotificationTargets(target);
    if (!targets.courierId && !targets.profileId && !targets.userId) {
      return {notifications: [], error: null};
    }

    let schema = await resolveNotificationSchema(targets);
    if (!schema.tableAvailable) {
      return {notifications: [], error: null};
    }

    const executeFetch = async (activeSchema: ResolvedNotifSchema) => {
      let q = supabase.from('notifications').select('*');
      if (activeSchema.ownerCol) {
        const ids = getCandidateIdsForColumn(activeSchema.ownerCol, targets);
        if (ids.length > 1) {
          q = q.in(activeSchema.ownerCol, ids);
        } else if (ids.length === 1) {
          q = q.eq(activeSchema.ownerCol, ids[0]);
        }
      }
      if (activeSchema.hasCreatedAtCol) {
        q = q.order('created_at', {ascending: false});
      }
      return q.limit(50);
    };

    let res = await executeFetch(schema);

    if (res.error && isColumnOrSchemaError(res.error.message, res.error.code)) {
      schema = await resolveNotificationSchema(targets, true);
      if (!schema.tableAvailable) {
        return {notifications: [], error: null};
      }
      res = await executeFetch(schema);

      if (res.error && isColumnOrSchemaError(res.error.message, res.error.code)) {
        const noOrderSchema: ResolvedNotifSchema = {...schema, hasCreatedAtCol: false};
        saveCachedNotifSchema(noOrderSchema);
        res = await executeFetch(noOrderSchema);
      }
    }

    if (res.error) {
      if (isNotificationTableMissingError(res.error.message, res.error.code)) {
        return {notifications: [], error: null};
      }
      console.warn('[Hatly Notifications] Could not fetch notifications:', res.error.message);
      return {notifications: [], error: res.error.message};
    }

    const rawRows = Array.isArray(res.data) ? (res.data as RawNotificationRow[]) : [];
    if (rawRows.length > 0) {
      saveCachedNotifSchema(deriveSchemaFromSampleRow(rawRows[0] as Record<string, unknown>));
    }

    const validOwnerIds = new Set(
      [targets.courierId, targets.profileId, targets.userId].filter((v): v is string => Boolean(v))
    );

    const normalized = rawRows
      .filter(Boolean)
      .filter((row) => {
        const rowOwner =
          row.courier_id ?? row.user_id ?? row.profile_id ?? row.recipient_id ?? null;
        if (!rowOwner || validOwnerIds.size === 0) return true;
        return validOwnerIds.has(String(rowOwner));
      })
      .map(normalizeNotification)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      notifications: normalized,
      error: null,
    };
  } catch (err) {
    console.warn('[Hatly Notifications] Unexpected fetch error:', err);
    return {
      notifications: [],
      error: err instanceof Error ? err.message : 'تعذر تحميل الإشعارات',
    };
  }
}

export async function markAllNotificationsRead(
  target: NotificationTargetInput
): Promise<{
  error: string | null;
}> {
  try {
    const targets = normalizeNotificationTargets(target);
    if (!targets.courierId && !targets.profileId && !targets.userId) {
      return {error: null};
    }

    const schema = await resolveNotificationSchema(targets);
    if (!schema.tableAvailable) return {error: null};

    const readCandidates: NotificationReadCol[] = schema.readCol
      ? [schema.readCol]
      : ['is_read', 'read'];

    for (const readCol of readCandidates) {
      let q = supabase.from('notifications').update({[readCol]: true});
      if (schema.ownerCol) {
        const ids = getCandidateIdsForColumn(schema.ownerCol, targets);
        if (ids.length > 1) {
          q = q.in(schema.ownerCol, ids);
        } else if (ids.length === 1) {
          q = q.eq(schema.ownerCol, ids[0]);
        }
      }
      q = q.eq(readCol, false);

      const {error} = await q;
      if (!error) {
        if (schema.readCol !== readCol) {
          saveCachedNotifSchema({...schema, readCol});
        }
        return {error: null};
      }

      if (!isColumnOrSchemaError(error.message, error.code)) {
        console.warn('[Hatly Notifications] Could not mark notifications read:', error.message);
        return {error: error.message};
      }
    }

    return {error: null};
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'تعذر تحديث حالة الإشعارات',
    };
  }
}

const NOTIFIED_KEYS_PREFIX = 'hatly_notified_events_';

function hasLocalNotifiedKey(courierId: string, key: string): boolean {
  if (!courierId || !key || typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(`${NOTIFIED_KEYS_PREFIX}${courierId}`);
    if (!raw) return false;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.includes(key);
  } catch {
    return false;
  }
}

function markLocalNotifiedKey(courierId: string, key: string): void {
  if (!courierId || !key || typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(`${NOTIFIED_KEYS_PREFIX}${courierId}`);
    const arr: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (!arr.includes(key)) {
      const updated = [...arr, key].slice(-200);
      window.localStorage.setItem(
        `${NOTIFIED_KEYS_PREFIX}${courierId}`,
        JSON.stringify(updated)
      );
    }
  } catch {
    // ignore storage errors
  }
}

const inFlightNotificationKeys = new Set<string>();

export async function createCourierNotification(params: {
  courierId: string;
  profileId?: string | null;
  userId?: string | null;
  title: string;
  message: string;
  type?: string;
  orderId?: string | null;
  dedupeKey?: string;
}): Promise<{notification: CourierNotification | null; error: string | null}> {
  const {courierId, profileId, userId, title, message, type, orderId, dedupeKey} = params;
  if (!courierId && !profileId && !userId) return {notification: null, error: null};
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {notification: null, error: null};
  }

  const dedupeOwner = courierId || profileId || userId || '';
  const scopedKey = dedupeKey ? `${dedupeOwner}:${dedupeKey}` : null;
  if (
    dedupeKey &&
    (hasLocalNotifiedKey(dedupeOwner, dedupeKey) ||
      (scopedKey && inFlightNotificationKeys.has(scopedKey)))
  ) {
    return {notification: null, error: null};
  }

  if (scopedKey) {
    inFlightNotificationKeys.add(scopedKey);
  }
  if (dedupeKey) {
    markLocalNotifiedKey(dedupeOwner, dedupeKey);
  }

  try {
    const targets: NotificationTargetIds = {courierId, profileId, userId};
    const schema = await resolveNotificationSchema(targets);
    if (!schema.tableAvailable) {
      return {notification: null, error: null};
    }

    const ownerField: NotificationOwnerCol = schema.ownerCol ?? 'user_id';
    const ownerVal = getPrimaryOwnerValue(ownerField, targets);
    const readField: NotificationReadCol = schema.readCol ?? 'is_read';

    const buildPayload = (
      msgKey: NotificationMsgCol,
      readKey: NotificationReadCol | null,
      includeExtras: boolean
    ): Record<string, unknown> => {
      const payload: Record<string, unknown> = {
        [ownerField]: ownerVal,
        title,
        [msgKey]: message,
      };
      if (readKey) payload[readKey] = false;
      if (includeExtras) {
        if (type && schema.hasTypeCol) payload.type = type;
        if (orderId && schema.hasOrderIdCol) payload.order_id = orderId;
      }
      return payload;
    };

    let res = await supabase
      .from('notifications')
      .insert(buildPayload(schema.msgCol, readField, true))
      .select('*')
      .maybeSingle();

    if (res.error && isColumnOrSchemaError(res.error.message, res.error.code)) {
      const fallbackCombos: Array<{msgKey: NotificationMsgCol; readKey: NotificationReadCol | null}> = [
        {msgKey: schema.msgCol, readKey: readField},
        {msgKey: schema.msgCol === 'message' ? 'body' : 'message', readKey: readField},
        {msgKey: schema.msgCol, readKey: readField === 'is_read' ? 'read' : 'is_read'},
        {msgKey: 'body', readKey: 'read'},
        {msgKey: 'message', readKey: null},
      ];

      for (const combo of fallbackCombos) {
        res = await supabase
          .from('notifications')
          .insert(buildPayload(combo.msgKey, combo.readKey, false))
          .select('*')
          .maybeSingle();
        if (!res.error || !isColumnOrSchemaError(res.error.message, res.error.code)) {
          if (!res.error) {
            saveCachedNotifSchema({
              ...schema,
              ownerCol: ownerField,
              msgCol: combo.msgKey,
              readCol: combo.readKey,
              hasTypeCol: false,
              hasOrderIdCol: false,
            });
          }
          break;
        }
      }
    }

    if (res.error) {
      console.warn('[Hatly Notifications] Could not insert notification:', res.error.message);
      return {notification: null, error: res.error.message};
    }

    if (res.data) {
      saveCachedNotifSchema(deriveSchemaFromSampleRow(res.data as Record<string, unknown>));
    }

    return {
      notification: res.data ? normalizeNotification(res.data as RawNotificationRow) : null,
      error: null,
    };
  } catch (err) {
    return {
      notification: null,
      error: err instanceof Error ? err.message : 'تعذر إنشاء الإشعار',
    };
  } finally {
    if (scopedKey) {
      inFlightNotificationKeys.delete(scopedKey);
    }
  }
}
