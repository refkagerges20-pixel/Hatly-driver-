export type AccountStatus = 'active' | 'pending' | 'suspended' | 'rejected' | string;

export type CourierAvailability = 'online' | 'offline';

export type OrderStatus =
  | 'assigned'
  | 'confirmed_by_courier'
  | 'accepted'
  | 'on_the_way_to_pickup'
  | 'picked_up'
  | 'on_the_way'
  | 'delivered'
  | 'cancelled';

export type ShiftStatus =
  | 'scheduled'
  | 'active'
  | 'late'
  | 'completed'
  | 'missed'
  | 'cancelled';

export type NavTab = 'home' | 'shifts' | 'orders' | 'wallet' | 'profile';

export interface RawCourierRow {
  id: string;
  profile_id?: string | null;
  user_id?: string | null;
  full_name?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  account_status?: AccountStatus | null;
  status?: string | null;
  cash_custody?: number | null;
  cash_balance?: number | null;
  custody_balance?: number | null;
  balance?: number | null;
  current_lat?: number | null;
  current_lng?: number | null;
  vehicle_type?: string | null;
  commission_rate?: number | null;
  force_online?: boolean | null;
  created_at?: string | null;
  [key: string]: unknown;
}

export interface CourierProfile {
  id: string;
  profileId: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  accountStatus: AccountStatus;
  status: CourierAvailability;
  cashCustody: number;
  cashColumnKey: 'cash_custody' | 'cash_balance' | 'custody_balance' | 'balance';
  currentLat: number | null;
  currentLng: number | null;
  vehicleType: string | null;
  commissionRate: number | null;
  forceOnline: boolean;
}

export interface RawOrderRow {
  id: string;
  order_number?: string | null;
  code?: string | null;
  courier_id?: string | null;
  merchant_id?: string | null;
  from_zone_id?: string | null;
  status: string;
  pickup_address?: string | null;
  pickup_location?: string | null;
  pickup_name?: string | null;
  merchant_name?: string | null;
  store_name?: string | null;
  pickup_lat?: number | string | null;
  pickup_lng?: number | string | null;
  merchant_lat?: number | string | null;
  merchant_lng?: number | string | null;
  delivery_address?: string | null;
  delivery_location?: string | null;
  dropoff_address?: string | null;
  delivery_lat?: number | string | null;
  dropoff_lat?: number | string | null;
  latitude?: number | string | null;
  customer_lat?: number | string | null;
  delivery_lng?: number | string | null;
  dropoff_lng?: number | string | null;
  longitude?: number | string | null;
  customer_lng?: number | string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  total?: number | null;
  total_amount?: number | null;
  amount?: number | null;
  products_total?: number | null;
  amount_to_collect?: number | null;
  subtotal?: number | null;
  cash_amount?: number | null;
  cod_amount?: number | null;
  delivery_fee?: number | null;
  delivery_fee_net?: number | null;
  courier_commission?: number | null;
  commission?: number | null;
  hatly_net_revenue?: number | null;
  is_cash_collected?: boolean | null;
  delivery_photo_1?: string | null;
  delivery_photo_2?: string | null;
  delivery_photo_3?: string | null;
  payment_method?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  delivered_at?: string | null;
  cancel_reason?: string | null;
  cancel_proof_url?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  rejected_by_couriers?: string[] | null;
  [key: string]: unknown;
}

export interface CourierOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  pickupName: string;
  pickupAddress: string;
  pickupLat: number | null;
  pickupLng: number | null;
  deliveryAddress: string;
  deliveryLat: number | null;
  deliveryLng: number | null;
  customerName: string;
  customerPhone: string;
  totalAmount: number;
  productsAmount: number;
  amountToCollect: number | null;
  deliveryFee: number;
  deliveryFeeNet: number;
  courierCommission: number;
  hatlyNetRevenue: number;
  isCashCollected: boolean;
  deliveryPhoto1: string | null;
  deliveryPhoto2: string | null;
  deliveryPhoto3: string | null;
  paymentMethod: string;
  notes: string | null;
  createdAt: string;
  deliveredAt: string | null;
  cancelReason: string | null;
  cancelProofUrl: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  rejectedByCouriers: string[];
}

export interface CourierDeposit {
  id: string;
  courier_id: string;
  amount: number;
  receipt_url: string | null;
  notes?: string | null;
  status?: string | null;
  deposit_date?: string | null;
  created_at: string;
}

export interface RawShiftRow {
  id: string;
  courier_id: string;
  shift_date?: string | null;
  date?: string | null;
  start_time: string;
  end_time: string;
  status?: string | null;
  check_in_time?: string | null;
  check_out_time?: string | null;
  check_in_photo_url?: string | null;
  late_minutes?: number | null;
  offline_minutes?: number | null;
  notes?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
}

export interface CourierShift {
  id: string;
  courierId: string;
  shiftDate: string;
  startTimeRaw: string;
  endTimeRaw: string;
  startDateTime: Date;
  endDateTime: Date;
  status: ShiftStatus;
  checkInTime: string | null;
  checkOutTime: string | null;
  checkInPhotoUrl: string | null;
  lateMinutes: number;
  offlineMinutes: number | null;
  notes: string | null;
}

export interface ShiftStatusEvent {
  id: string;
  courierId: string;
  shiftId?: string | null;
  dateKey: string; // YYYY-MM-DD local date
  status: 'online' | 'offline';
  reason?: 'check_in' | 'check_out' | 'toggle' | string;
  timestamp: string; // ISO string
}

export interface RawNotificationRow {
  id: string;
  courier_id?: string | null;
  user_id?: string | null;
  profile_id?: string | null;
  recipient_id?: string | null;
  title?: string | null;
  message?: string | null;
  body?: string | null;
  content?: string | null;
  type?: string | null;
  order_id?: string | null;
  is_read?: boolean | null;
  read?: boolean | null;
  created_at?: string | null;
  [key: string]: unknown;
}

export interface CourierNotification {
  id: string;
  courierId: string;
  title: string;
  message: string;
  type: string | null;
  orderId: string | null;
  isRead: boolean;
  createdAt: string;
}
