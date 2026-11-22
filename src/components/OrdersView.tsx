import React, {useEffect, useMemo, useState} from 'react';
import {CalendarDays, CheckCircle2, ClipboardList} from 'lucide-react';
import {summarizeAndFilterOrders} from '../lib/supabase';
import type {CourierOrder, CourierProfile, OrderStatus} from '../types/hatly';
import {OrderCard} from './OrderCard';

interface OrdersViewProps {
  courier: CourierProfile;
  orders: CourierOrder[];
  isAccountLocked: boolean;
  onAcceptOrder: (order: CourierOrder) => Promise<void>;
  onRejectOrder: (order: CourierOrder) => Promise<void>;
  onAdvanceOrderStatus: (order: CourierOrder, nextStatus: OrderStatus) => Promise<void>;
  onRequestDeliveryProof: (order: CourierOrder) => void;
  onRequestCancel: (order: CourierOrder) => void;
  onRefreshOrders?: () => Promise<void>;
}

type FilterTab = 'active' | 'delivered' | 'cancelled';

export const OrdersView: React.FC<OrdersViewProps> = ({
  courier,
  orders,
  isAccountLocked,
  onAcceptOrder,
  onRejectOrder,
  onAdvanceOrderStatus,
  onRequestDeliveryProof,
  onRequestCancel,
  onRefreshOrders,
}) => {
  const [filter, setFilter] = useState<FilterTab>('active');

  useEffect(() => {
    void onRefreshOrders?.();
  }, [onRefreshOrders]);

  const {
    activeOrders: activeList,
    deliveredOrders: deliveredList,
    cancelledOrders: cancelledList,
    todayDeliveredCount,
    monthDeliveredCount,
  } = useMemo(() => summarizeAndFilterOrders(orders), [orders]);

  const filtered =
    filter === 'active'
      ? activeList
      : filter === 'delivered'
        ? deliveredList
        : cancelledList;

  return (
    <div className="space-y-4">
      {/* Summary Card: Today & This Month Delivered Orders */}
      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-[#0A192F] text-white p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-slate-300">إجمالي طلبات اليوم</p>
            <p className="mt-1 text-2xl sm:text-3xl font-extrabold tabular-nums">
              {todayDeliveredCount}
            </p>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF7B00]/20 text-[#FF7B00]">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-slate-500">إجمالي طلبات الشهر</p>
            <p className="mt-1 text-2xl sm:text-3xl font-extrabold text-[#0A192F] tabular-nums">
              {monthDeliveredCount}
            </p>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F6F8FB] text-[#0A192F]">
            <CalendarDays className="h-5 w-5 text-[#FF7B00]" />
          </div>
        </div>
      </section>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-[#0A192F]">طلباتي</h2>
          <p className="text-xs text-slate-500">
            متابعة الطلبات النشطة وسجل التوصيلات المكتملة والملغية
          </p>
        </div>

        {/* Segmented Control */}
        <div className="grid grid-cols-3 sm:inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl">
          <button
            type="button"
            onClick={() => setFilter('active')}
            className={`min-h-[40px] px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              filter === 'active'
                ? 'bg-white text-[#0A192F] shadow-xs'
                : 'text-slate-600 hover:text-[#0A192F]'
            }`}
          >
            النشطة ({activeList.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('delivered')}
            className={`min-h-[40px] px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              filter === 'delivered'
                ? 'bg-white text-[#0A192F] shadow-xs'
                : 'text-slate-600 hover:text-[#0A192F]'
            }`}
          >
            المكتملة ({deliveredList.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('cancelled')}
            className={`min-h-[40px] px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              filter === 'cancelled'
                ? 'bg-white text-red-600 shadow-xs'
                : 'text-slate-600 hover:text-[#0A192F]'
            }`}
          >
            الملغية ({cancelledList.length})
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-3xl bg-white border border-slate-200 p-10 text-center space-y-2.5">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F6F8FB] text-[#0A192F]">
            <ClipboardList className="h-7 w-7 text-slate-400" />
          </div>
          <h3 className="text-base font-extrabold text-[#0A192F]">
            لا توجد طلبات في هذا القسم
          </h3>
          <p className="text-xs text-slate-500">
            {filter === 'active'
              ? 'ستظهر الطلبات المعينة لك هنا فور إسنادها.'
              : filter === 'delivered'
                ? 'لم تقم بتسليم أي طلبات بعد.'
                : 'لا توجد طلبات ملغية مسجلة.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              courierLat={courier.currentLat}
              courierLng={courier.currentLng}
              isAccountLocked={isAccountLocked}
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
    </div>
  );
};
