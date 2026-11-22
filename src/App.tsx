import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {User} from '@supabase/supabase-js';
import {Bell, RefreshCw} from 'lucide-react';
import {BottomNav} from './components/BottomNav';
import {CancelOrderModal} from './components/CancelOrderModal';
import {DeliveryProofModal, type DeliveryProofUrls} from './components/DeliveryProofModal';
import {DepositSheet} from './components/DepositSheet';
import {ErrorBoundary} from './components/ErrorBoundary';
import {HatlyLogo} from './components/HatlyLogo';
import {HomeView} from './components/HomeView';
import {LoginView} from './components/LoginView';
import {MfaChallengeView} from './components/MfaChallengeView';
import {MfaEnrollmentView} from './components/MfaEnrollmentView';
import {NotificationsModal} from './components/NotificationsModal';
import {OfflineIndicator} from './components/OfflineIndicator';
import {OrdersView} from './components/OrdersView';
import {ProfileView} from './components/ProfileView';
import {PWAInstallButton} from './components/PWAInstallButton';
import {ShiftCheckInSheet} from './components/ShiftCheckInSheet';
import {ShiftsView} from './components/ShiftsView';
import {WalletView} from './components/WalletView';
import {
  CASH_LOCK_LIMIT_EGP,
  acceptAssignedOrderRecord,
  calculateCustodyBalance,
  computeShiftOfflineMinutes,
  createCourierNotification,
  endCourierShiftRecord,
  enqueueOfflineStatusUpdate,
  evaluateShiftAvailabilityWindow,
  fetchCourierByAuthUser,
  fetchCourierCommissionPercentage,
  fetchCourierDeposits,
  fetchCourierNotifications,
  fetchCourierOrders,
  fetchCourierShifts,
  flushOfflineStatusQueue,
  getLocalDateKey,
  isLikelyOfflineError,
  isShiftForToday,
  isShiftWithinActiveWindow,
  loadOfflineStatusQueue,
  loadShiftStatusEvents,
  markAllNotificationsRead,
  normalizeNotification,
  recordShiftStatusEvent,
  rejectAssignedOrderRecord,
  setOrderLocallyPickupEnroute,
  summarizeAndFilterOrders,
  supabase,
} from './lib/supabase';
import type {
  CourierDeposit,
  CourierNotification,
  CourierOrder,
  CourierProfile,
  CourierShift,
  NavTab,
  OrderStatus,
  RawNotificationRow,
  ShiftStatusEvent,
} from './types/hatly';

const DESKTOP_TABS: {id: NavTab; label: string}[] = [
  {id: 'home', label: 'الرئيسية'},
  {id: 'shifts', label: 'وردياتي'},
  {id: 'orders', label: 'طلباتي'},
  {id: 'wallet', label: 'محفظتي'},
  {id: 'profile', label: 'حسابي'},
];

type MfaGateStage =
  | 'idle'
  | 'checking'
  | 'enroll_required'
  | 'challenge_required'
  | 'verified';

export default function App() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [mfaStage, setMfaStage] = useState<MfaGateStage>('idle');
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaError, setMfaError] = useState<string | null>(null);

  const [courier, setCourier] = useState<CourierProfile | null>(null);
  const [noProfileFound, setNoProfileFound] = useState(false);
  const [orders, setOrders] = useState<CourierOrder[]>([]);
  const [deposits, setDeposits] = useState<CourierDeposit[]>([]);
  const [shifts, setShifts] = useState<CourierShift[]>([]);
  const [shiftEvents, setShiftEvents] = useState<ShiftStatusEvent[]>([]);
  const [notifications, setNotifications] = useState<CourierNotification[]>([]);

  const [loadingData, setLoadingData] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [depositOpen, setDepositOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [highlightedUnreadIds, setHighlightedUnreadIds] = useState<Set<string>>(
    () => new Set()
  );
  const [checkInShift, setCheckInShift] = useState<CourierShift | null>(null);
  const [cancelTargetOrder, setCancelTargetOrder] = useState<CourierOrder | null>(null);
  const [deliveryProofTargetOrder, setDeliveryProofTargetOrder] = useState<CourierOrder | null>(null);

  const [gpsError, setGpsError] = useState<string | null>(null);
  const [lastGpsSync, setLastGpsSync] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const courierIdRef = useRef<string | null>(null);
  const profileIdRef = useRef<string | null>(null);
  const courierRef = useRef<CourierProfile | null>(null);
  const mfaStageRef = useRef<MfaGateStage>('idle');
  const mfaCheckInFlightRef = useRef<Promise<void> | null>(null);
  const verifiedLoadedUserIdRef = useRef<string | null>(null);
  const selfCancelledOrderIdsRef = useRef<Set<string>>(new Set());
  courierIdRef.current = courier?.id ?? null;
  profileIdRef.current = courier?.profileId ?? authUser?.id ?? null;
  courierRef.current = courier;
  mfaStageRef.current = mfaStage;

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  const refreshNotificationsOnly = useCallback(async () => {
    const current = courierRef.current;
    if (!current?.id) return;
    setLoadingNotifications(true);
    try {
      const res = await fetchCourierNotifications({
        courierId: current.id,
        profileId: current.profileId,
        userId: current.userId,
      });
      if (!res.error) {
        setNotifications(res.notifications);
      }
    } finally {
      setLoadingNotifications(false);
    }
  }, []);

  const handleOpenNotifications = useCallback(async () => {
    const current = courierRef.current;
    setNotificationsOpen(true);
    if (!current?.id) return;

    const targets = {
      courierId: current.id,
      profileId: current.profileId,
      userId: current.userId,
    };

    setLoadingNotifications(true);
    try {
      const res = await fetchCourierNotifications(targets);
      const list = !res.error ? res.notifications : notifications;
      const unreadIds = new Set(list.filter((n) => !n.isRead).map((n) => n.id));
      setHighlightedUnreadIds(unreadIds);
      setNotifications(list.map((n) => ({...n, isRead: true})));

      if (unreadIds.size > 0) {
        await markAllNotificationsRead(targets);
      }
    } finally {
      setLoadingNotifications(false);
    }
  }, [notifications]);

  const loadCourierBundle = useCallback(async (user: User) => {
    setLoadingData(true);
    setNoProfileFound(false);
    try {
      const {courier: profile, error} = await fetchCourierByAuthUser(user);
      console.log('[Hatly App] loadCourierBundle result:', {profile, error});
      if ((error && !profile) || !profile) {
        setNoProfileFound(true);
        setCourier(null);
        return;
      }

      setCourier(profile);
      console.log('[Hatly App] account_status check:', {
        accountStatus: profile.accountStatus,
        isActive: profile.accountStatus === 'active',
      });

      if (profile.accountStatus === 'active') {
        setShiftEvents(loadShiftStatusEvents(profile.id));
        const [ordersRes, depositsRes, shiftsRes, notificationsRes] = await Promise.all([
          fetchCourierOrders(profile.id, {
            alternateCourierIds: [profile.profileId, profile.userId, user.id],
          }),
          fetchCourierDeposits(profile.id, {
            alternateCourierIds: [profile.profileId, profile.userId, user.id],
          }),
          fetchCourierShifts(profile.id),
          fetchCourierNotifications({
            courierId: profile.id,
            profileId: profile.profileId,
            userId: profile.userId || user.id,
          }),
        ]);
        console.log('[Hatly App] Fetched courier orders:', ordersRes);
        console.log('[Hatly App] Fetched courier shifts:', shiftsRes);
        if (ordersRes.error) {
          showToast(`تعذر تحميل الطلبات: ${ordersRes.error}`);
        }
        const loadedOrders = Array.isArray(ordersRes.orders) ? ordersRes.orders : [];
        const loadedShifts = Array.isArray(shiftsRes.shifts) ? shiftsRes.shifts : [];
        const loadedNotifications = Array.isArray(notificationsRes.notifications)
          ? notificationsRes.notifications
          : [];

        setOrders(loadedOrders);
        if (!depositsRes.error) {
          setDeposits(Array.isArray(depositsRes.deposits) ? depositsRes.deposits : []);
        }
        setShifts(loadedShifts);
        setNotifications(loadedNotifications);

        // Ensure assigned orders without a notification generate "طلب جديد معين لك"
        const newlyCreatedNotifs: CourierNotification[] = [];
        for (const ord of loadedOrders) {
          if (ord.status === 'assigned') {
            const alreadyInDb = loadedNotifications.some(
              (n) =>
                n.orderId === ord.id ||
                (n.title.includes('طلب جديد معين لك') && n.message.includes(ord.orderNumber))
            );
            if (!alreadyInDb) {
              const created = await createCourierNotification({
                courierId: profile.id,
                profileId: profile.profileId,
                userId: profile.userId || user.id,
                title: 'طلب جديد معين لك',
                message: `تم تعيين الطلب #${ord.orderNumber} لك (${ord.pickupName} ← ${ord.deliveryAddress}).`,
                type: 'order_assigned',
                orderId: ord.id,
                dedupeKey: `assigned:${ord.id}`,
              });
              if (created.notification) {
                newlyCreatedNotifs.push(created.notification);
              }
            }
          }
        }
        if (newlyCreatedNotifs.length > 0) {
          setNotifications((prev) => {
            const seen = new Set(prev.map((p) => p.id));
            return [...newlyCreatedNotifs.filter((n) => !seen.has(n.id)), ...prev];
          });
        }

        if (!shiftsRes.error && profile.status === 'online') {
          const initialGate = evaluateShiftAvailabilityWindow(loadedShifts, new Date(), {
            forceOnline: profile.forceOnline,
          });
          if (!initialGate.canGoOnline) {
            await supabase
              .from('couriers')
              .update({status: 'offline'})
              .eq('profile_id', profile.profileId);
            setCourier((prev) => (prev ? {...prev, status: 'offline'} : prev));
          }
        }
      }
    } catch (err) {
      console.error('[Hatly App] Error in loadCourierBundle:', err);
      showToast('تعذر تحميل بعض البيانات، يرجى المحاولة مرة أخرى');
    } finally {
      setLoadingData(false);
    }
  }, [showToast]);

  const refreshOrdersOnly = useCallback(async () => {
    const cid = courierIdRef.current;
    if (!cid) return;
    const currentCourier = courierRef.current;
    const res = await fetchCourierOrders(cid, {
      alternateCourierIds: currentCourier
        ? [currentCourier.profileId, currentCourier.userId]
        : [],
    });
    if (!res.error) {
      setOrders(Array.isArray(res.orders) ? res.orders : []);
    }
  }, []);

  const refreshDepositsOnly = useCallback(
    async (createdDeposit?: CourierDeposit | null) => {
      const cid = courierIdRef.current;
      if (!cid) return;
      const currentCourier = courierRef.current;
      const res = await fetchCourierDeposits(cid, {
        alternateCourierIds: currentCourier
          ? [currentCourier.profileId, currentCourier.userId]
          : [],
      });

      if (!res.error) {
        const fetched = Array.isArray(res.deposits) ? res.deposits : [];
        if (
          createdDeposit &&
          !fetched.some(
            (d) =>
              d.id === createdDeposit.id ||
              (d.receipt_url && d.receipt_url === createdDeposit.receipt_url)
          )
        ) {
          setDeposits([createdDeposit, ...fetched]);
        } else {
          setDeposits(fetched);
        }
      } else if (createdDeposit) {
        setDeposits((prev) => {
          if (
            prev.some(
              (d) =>
                d.id === createdDeposit.id ||
                (d.receipt_url && d.receipt_url === createdDeposit.receipt_url)
            )
          ) {
            return prev;
          }
          return [createdDeposit, ...prev];
        });
      }
    },
    []
  );

  const evaluateMfaAndLoad = useCallback(
    async (user: User, options?: {silentIfVerified?: boolean}) => {
      if (mfaCheckInFlightRef.current) {
        return mfaCheckInFlightRef.current;
      }

      const run = (async () => {
        const keepVerifiedView =
          options?.silentIfVerified && mfaStageRef.current === 'verified';
        if (!keepVerifiedView) {
          setMfaStage('checking');
        }
        setMfaError(null);

        try {
          const [aalRes, factorsRes] = await Promise.all([
            supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
            supabase.auth.mfa.listFactors(),
          ]);

          const currentLevel = aalRes.data?.currentLevel ?? null;
          const nextLevel = aalRes.data?.nextLevel ?? null;

          const userEmbeddedFactors =
            (
              user as unknown as {
                factors?: Array<{id: string; factor_type: string; status: string}>;
              }
            ).factors ?? [];

          const allFactors = factorsRes.data?.all ?? userEmbeddedFactors;
          const verifiedTotpFactors =
            factorsRes.data?.totp && factorsRes.data.totp.length > 0
              ? factorsRes.data.totp
              : allFactors.filter(
                  (f) => f.factor_type === 'totp' && f.status === 'verified'
                );
          const anyVerifiedFactors = allFactors.filter((f) => f.status === 'verified');

          // 1. No verified MFA factors -> redirect to "تأمين الحساب" (MFA Enrollment)
          if (
            anyVerifiedFactors.length === 0 &&
            nextLevel !== 'aal2' &&
            currentLevel !== 'aal2'
          ) {
            verifiedLoadedUserIdRef.current = null;
            setMfaFactorId(null);
            setMfaStage('enroll_required');
            return;
          }

          // 2. Enrolled, but current session is aal1 and nextLevel is aal2 -> MFA Challenge
          if (currentLevel === 'aal1' && nextLevel === 'aal2') {
            verifiedLoadedUserIdRef.current = null;
            const targetFactor = verifiedTotpFactors[0] ?? anyVerifiedFactors[0] ?? null;
            setMfaFactorId(targetFactor?.id ?? null);
            setMfaStage('challenge_required');
            return;
          }

          // 3. Passed MFA (aal2) -> load courier profile & home screen once
          setMfaFactorId(verifiedTotpFactors[0]?.id ?? anyVerifiedFactors[0]?.id ?? null);
          setMfaStage('verified');
          if (!keepVerifiedView && verifiedLoadedUserIdRef.current !== user.id) {
            verifiedLoadedUserIdRef.current = user.id;
            await loadCourierBundle(user);
          }
        } catch (err) {
          console.warn('[Hatly MFA] Failed to check MFA status:', err);
          setMfaError('تعذر التحقق من حالة المصادقة الثنائية. يرجى المحاولة مرة أخرى.');
          setMfaStage('challenge_required');
        }
      })().finally(() => {
        mfaCheckInFlightRef.current = null;
      });

      mfaCheckInFlightRef.current = run;
      return run;
    },
    [loadCourierBundle]
  );

  // Flush queued status updates automatically when internet connection returns
  useEffect(() => {
    const syncQueuedUpdates = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      if (loadOfflineStatusQueue().length === 0) return;

      const {syncedCount} = await flushOfflineStatusQueue();
      if (syncedCount > 0) {
        showToast(`تمت مزامنة ${syncedCount} تحديث حالة بعد عودة الاتصال`);
        if (authUser && mfaStageRef.current === 'verified') {
          void loadCourierBundle(authUser);
        }
      }
    };

    void syncQueuedUpdates();
    window.addEventListener('online', syncQueuedUpdates);
    return () => {
      window.removeEventListener('online', syncQueuedUpdates);
    };
  }, [authUser, loadCourierBundle, showToast]);

  // Initialize Supabase Auth session & listener with MFA gate
  useEffect(() => {
    let mounted = true;
    let initialHandled = false;

    supabase.auth
      .getSession()
      .then(({data}) => {
        if (!mounted) return;
        const user = data?.session?.user ?? null;
        setAuthUser(user);
        setAuthReady(true);
        if (user && !initialHandled) {
          initialHandled = true;
          void evaluateMfaAndLoad(user);
        } else if (!user) {
          setMfaStage('idle');
        }
      })
      .catch((err) => {
        console.error('[Hatly Auth] getSession failed:', err);
        if (mounted) {
          setAuthUser(null);
          setMfaStage('idle');
          setAuthReady(true);
        }
      });

    const {data: sub} = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      const user = session?.user ?? null;
      setAuthUser(user);
      setAuthReady(true);

      if (!user) {
        initialHandled = false;
        verifiedLoadedUserIdRef.current = null;
        setMfaStage('idle');
        setMfaFactorId(null);
        setMfaError(null);
        setCourier(null);
        setOrders([]);
        setDeposits([]);
        setShifts([]);
        setShiftEvents([]);
        setNotifications([]);
        setNoProfileFound(false);
        return;
      }

      if (event === 'INITIAL_SESSION') {
        if (!initialHandled) {
          initialHandled = true;
          void evaluateMfaAndLoad(user);
        }
        return;
      }

      if (event === 'TOKEN_REFRESHED') {
        void evaluateMfaAndLoad(user, {silentIfVerified: true});
        return;
      }

      // SIGNED_IN, MFA_CHALLENGE_VERIFIED, USER_UPDATED
      initialHandled = true;
      void evaluateMfaAndLoad(user);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [evaluateMfaAndLoad]);

  // Realtime subscription on orders, notifications, couriers, and courier_shifts when active and MFA verified
  useEffect(() => {
    if (mfaStage !== 'verified' || !courier || courier.accountStatus !== 'active') return;

    const channel = supabase
      .channel(`courier-live-${courier.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `courier_id=eq.${courier.id}`,
        },
        (payload) => {
          console.log('[Hatly Realtime] Orders change event:', payload);
          void fetchCourierOrders(courier.id, {
            alternateCourierIds: [courier.profileId, courier.userId],
          }).then((res) => {
            if (!res.error) {
              setOrders((prev) => {
                const prevMap = new Map(prev.map((o) => [o.id, o]));
                const newlyAssigned = res.orders.filter(
                  (o) =>
                    !prevMap.has(o.id) &&
                    o.status !== 'delivered' &&
                    o.status !== 'cancelled'
                );
                if (newlyAssigned.length > 0 || payload.eventType === 'INSERT') {
                  showToast('طلب جديد معين لك');
                  for (const ord of newlyAssigned) {
                    void createCourierNotification({
                      courierId: courier.id,
                      profileId: courier.profileId,
                      userId: courier.userId,
                      title: 'طلب جديد معين لك',
                      message: `تم تعيين الطلب #${ord.orderNumber} لك (${ord.pickupName} ← ${ord.deliveryAddress}).`,
                      type: 'order_assigned',
                      orderId: ord.id,
                      dedupeKey: `assigned:${ord.id}`,
                    });
                  }
                }

                // Detect admin-approved cancellation or external order cancellation
                for (const ord of res.orders) {
                  const prevOrd = prevMap.get(ord.id);
                  if (
                    ord.status === 'cancelled' &&
                    prevOrd &&
                    prevOrd.status !== 'cancelled' &&
                    !selfCancelledOrderIdsRef.current.has(ord.id)
                  ) {
                    void createCourierNotification({
                      courierId: courier.id,
                      profileId: courier.profileId,
                      userId: courier.userId,
                      title: 'تم إلغاء الطلب من الإدارة',
                      message: `تمت الموافقة على إلغاء الطلب #${ord.orderNumber}.`,
                      type: 'order_cancelled',
                      orderId: ord.id,
                      dedupeKey: `cancelled:${ord.id}`,
                    });
                  }
                }

                return res.orders;
              });
            }
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
        },
        (payload) => {
          const row = (payload.new || payload.old) as RawNotificationRow | undefined;
          const rowOwner =
            row?.courier_id ?? row?.user_id ?? row?.profile_id ?? row?.recipient_id ?? null;
          const validOwners = new Set(
            [courier.id, courier.profileId, courier.userId].filter(Boolean)
          );
          if (rowOwner && !validOwners.has(String(rowOwner))) {
            return;
          }

          console.log('[Hatly Realtime] Notifications change event:', payload);
          if (payload.eventType === 'INSERT' && payload.new) {
            const incoming = normalizeNotification(payload.new as RawNotificationRow);
            setNotifications((prev) => {
              if (prev.some((n) => n.id === incoming.id)) return prev;
              return [incoming, ...prev];
            });
            showToast(
              incoming.message ? `${incoming.title}: ${incoming.message}` : incoming.title
            );
          } else {
            void fetchCourierNotifications({
              courierId: courier.id,
              profileId: courier.profileId,
              userId: courier.userId,
            }).then((res) => {
              if (!res.error) setNotifications(res.notifications);
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'courier_shifts',
          filter: `courier_id=eq.${courier.id}`,
        },
        (payload) => {
          void fetchCourierShifts(courier.id).then((res) => setShifts(res.shifts));
          if (payload.eventType === 'INSERT') {
            void createCourierNotification({
              courierId: courier.id,
              profileId: courier.profileId,
              userId: courier.userId,
              title: 'تحديث في جدول الورديات',
              message: 'تمت إضافة أو تحديث وردية جديدة في جدولك بواسطة الإدارة.',
              type: 'shift_updated',
              dedupeKey: `shift_insert:${String((payload.new as {id?: string})?.id ?? Date.now())}`,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'courier_deposits',
          filter: `courier_id=eq.${courier.id}`,
        },
        () => {
          void fetchCourierDeposits(courier.id, {
            alternateCourierIds: [courier.profileId, courier.userId],
          }).then((res) => {
            if (!res.error) setDeposits(res.deposits);
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'couriers',
          filter: `profile_id=eq.${courier.profileId}`,
        },
        () => {
          if (authUser) {
            const wasForced = courierRef.current?.forceOnline === true;
            void fetchCourierByAuthUser(authUser).then((res) => {
              if (res.courier) {
                if (!wasForced && res.courier.forceOnline) {
                  void createCourierNotification({
                    courierId: res.courier.id,
                    profileId: res.courier.profileId,
                    userId: res.courier.userId,
                    title: 'تفعيل الحساب من الإدارة',
                    message: 'تم تفعيل حسابك بواسطة الإدارة.',
                    type: 'admin_force_online',
                    dedupeKey: `force_online:${Math.floor(Date.now() / 10000)}`,
                  });
                }
                setCourier(res.courier);
              }
            });
          }
        }
      )
      .subscribe((status) => {
        console.log('[Hatly Realtime] Channel subscription status:', status);
        if (status === 'SUBSCRIBED') {
          void fetchCourierOrders(courier.id, {
            alternateCourierIds: [courier.profileId, courier.userId],
          }).then((res) => {
            if (!res.error) setOrders(res.orders);
          });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [courier?.id, courier?.profileId, courier?.userId, courier?.accountStatus, authUser, showToast]);

  // Identify active checked-in shift & next scheduled shift for today / upcoming
  const {activeCheckedInShift, nextEligibleShift} = useMemo(() => {
    const now = new Date();
    const checkedIn =
      shifts.find(
        (s) =>
          (s.status === 'active' || s.status === 'late') &&
          Boolean(s.checkInTime) &&
          Boolean(s.checkInPhotoUrl) &&
          !s.checkOutTime &&
          (now.getTime() <= s.endDateTime.getTime() || isShiftForToday(s, now))
      ) ?? null;

    // 1. Prefer today's shift within active window [start_time, end_time] missing selfie check-in
    const todayWindowShift =
      shifts.find(
        (s) =>
          isShiftForToday(s, now) &&
          s.status !== 'completed' &&
          s.status !== 'cancelled' &&
          !s.checkOutTime &&
          !s.checkInPhotoUrl &&
          isShiftWithinActiveWindow(s, now)
      ) ?? null;

    // 2. Fallback to any scheduled shift for today or upcoming missing selfie check-in
    const upcomingScheduled = shifts
      .filter(
        (s) =>
          s.status === 'scheduled' &&
          !s.checkInPhotoUrl &&
          (isShiftForToday(s, now) || now.getTime() <= s.endDateTime.getTime())
      )
      .sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime());

    const chosenNext = todayWindowShift ?? upcomingScheduled[0] ?? null;

    console.log('[Hatly App] Active & eligible shift selection:', {
      totalShifts: shifts.length,
      activeCheckedInShift: checkedIn,
      nextEligibleShift: chosenNext,
    });

    return {
      activeCheckedInShift: checkedIn,
      nextEligibleShift: chosenNext,
    };
  }, [shifts]);

  // Shared Custody Balance across Home, Wallet, and lock checks:
  // SUM(orders.total WHERE status='delivered' AND payment_method='cash' AND is_cash_collected=true) - SUM(courier_deposits.amount)
  const custodyBalance = useMemo(
    () => calculateCustodyBalance(orders, deposits),
    [orders, deposits]
  );

  // Live Location: update couriers.current_lat and couriers.current_lng while online and MFA verified
  const isOnlineAndUnlocked =
    mfaStage === 'verified' &&
    courier?.accountStatus === 'active' &&
    courier?.status === 'online' &&
    custodyBalance < CASH_LOCK_LIMIT_EGP;

  useEffect(() => {
    if (!isOnlineAndUnlocked || !courier) return;

    if (!('geolocation' in navigator)) {
      setGpsError('المتصفح لا يدعم تحديد الموقع الجغرافي');
      return;
    }

    const sendCoordsToSupabase = async (lat: number, lng: number) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;

      setGpsError(null);
      const targetProfileId = profileIdRef.current;
      if (!targetProfileId) return;

      const {error} = await supabase
        .from('couriers')
        .update({current_lat: lat, current_lng: lng})
        .eq('profile_id', targetProfileId);

      if (error) {
        if (!isLikelyOfflineError(error.message)) {
          setGpsError(`تعذر حفظ الموقع: ${error.message}`);
        }
        return;
      }

      setCourier((prev) =>
        prev ? {...prev, currentLat: lat, currentLng: lng} : prev
      );
      setLastGpsSync(
        new Intl.DateTimeFormat('ar-EG', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }).format(new Date())
      );
    };

    const pushLocation = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          void sendCoordsToSupabase(pos.coords.latitude, pos.coords.longitude);
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setGpsError('يرجى السماح بصلاحية الموقع لتحديث موقعك المباشر');
          } else {
            setGpsError('تعذر تحديد الموقع الجغرافي حالياً');
          }
        },
        {enableHighAccuracy: true, timeout: 12000, maximumAge: 25000}
      );
    };

    // Battery-optimized GPS polling: single getCurrentPosition every 30 seconds (no continuous watchPosition)
    pushLocation();
    const intervalId = window.setInterval(pushLocation, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isOnlineAndUnlocked, courier?.id]);

  const handleLogin = async (email: string, password: string): Promise<string | null> => {
    const {error} = await supabase.auth.signInWithPassword({email, password});
    if (error) {
      if (error.message.toLowerCase().includes('invalid login')) {
        return 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
      }
      return error.message;
    }
    return null;
  };

  const handleSignOut = async () => {
    if (courier && courier.status === 'online') {
      await supabase
        .from('couriers')
        .update({status: 'offline'})
        .eq('profile_id', courier.profileId);
    }
    await supabase.auth.signOut();
  };

  const handleToggleAvailability = async () => {
    if (!courier) return;
    if (custodyBalance >= CASH_LOCK_LIMIT_EGP) {
      showToast('يجب توريد المبلغ لفتح الحساب');
      return;
    }
    const nextStatus = courier.status === 'online' ? 'offline' : 'online';
    const isConnected = typeof navigator === 'undefined' ? true : navigator.onLine;

    // Re-validate force_online & today's shift window + selfie every time courier attempts to go online
    if (nextStatus === 'online') {
      let shiftsToCheck = shifts;
      let latestForceOnline = courier.forceOnline;

      if (isConnected) {
        const [latestShiftsRes, latestCourierRes] = await Promise.all([
          fetchCourierShifts(courier.id),
          authUser ? fetchCourierByAuthUser(authUser) : Promise.resolve({courier: null, error: null}),
        ]);
        if (!latestShiftsRes.error && latestShiftsRes.shifts.length > 0) {
          shiftsToCheck = latestShiftsRes.shifts;
          setShifts(latestShiftsRes.shifts);
        }
        if (latestCourierRes.courier) {
          latestForceOnline = latestCourierRes.courier.forceOnline;
          setCourier(latestCourierRes.courier);
        }
      }

      const gate = evaluateShiftAvailabilityWindow(shiftsToCheck, new Date(), {
        forceOnline: latestForceOnline,
      });
      if (!gate.canGoOnline) {
        showToast(
          gate.message ||
            'لا يمكنك بدء العمل حالياً. يرجى التأكد من موعد ورديتك وتصوير الزي.'
        );
        return;
      }
    }

    const targetProfileId = courier.profileId || authUser?.id || courier.id;

    if (!isConnected) {
      enqueueOfflineStatusUpdate({
        type: 'courier_availability',
        status: nextStatus,
        profileId: targetProfileId,
      });
      setCourier((prev) => (prev ? {...prev, status: nextStatus} : prev));
      const updatedEvents = recordShiftStatusEvent(courier.id, {
        shiftId: activeCheckedInShift?.id ?? null,
        status: nextStatus,
        reason: 'toggle',
        timestamp: new Date().toISOString(),
      });
      setShiftEvents(updatedEvents);
      showToast('لا يوجد إنترنت — تم حفظ تحديث الحالة وسيتم إرساله عند عودة الاتصال');
      return;
    }

    const {error} = await supabase
      .from('couriers')
      .update({status: nextStatus})
      .eq('profile_id', targetProfileId)
      .select('id,status')
      .maybeSingle();

    if (error) {
      if (isLikelyOfflineError(error.message)) {
        enqueueOfflineStatusUpdate({
          type: 'courier_availability',
          status: nextStatus,
          profileId: targetProfileId,
        });
        setCourier((prev) => (prev ? {...prev, status: nextStatus} : prev));
        showToast('انقطع الاتصال — تم حفظ الحالة وسيتم إرسالها عند عودة الإنترنت');
        return;
      }
      showToast(`تعذر تحديث الحالة: ${error.message}`);
      return;
    }

    setCourier((prev) => (prev ? {...prev, status: nextStatus} : prev));

    const updatedEvents = recordShiftStatusEvent(courier.id, {
      shiftId: activeCheckedInShift?.id ?? null,
      status: nextStatus,
      reason: 'toggle',
      timestamp: new Date().toISOString(),
    });
    setShiftEvents(updatedEvents);

    showToast(
      nextStatus === 'online' ? 'أنت الآن متاح لاستقبال الطلبات' : 'تم تحويلك إلى غير متاح'
    );
  };

  const handleEndShift = async () => {
    if (!courier) return;
    const now = new Date();
    const nowIso = now.toISOString();
    const todayKey = getLocalDateKey(now);
    const targetProfileId = courier.profileId || authUser?.id || courier.id;

    const targetShift =
      activeCheckedInShift ??
      shifts.find(
        (s) =>
          isShiftForToday(s, now) &&
          !s.checkOutTime &&
          (s.status === 'active' || s.status === 'late' || s.status === 'scheduled')
      ) ??
      null;

    const updatedEvents = recordShiftStatusEvent(courier.id, {
      shiftId: targetShift?.id ?? null,
      dateKey: todayKey,
      status: 'offline',
      reason: 'check_out',
      timestamp: nowIso,
    });
    setShiftEvents(updatedEvents);

    const dayEvents = updatedEvents.filter(
      (e) => (targetShift && e.shiftId === targetShift.id) || e.dateKey === todayKey
    );
    const offlineMinutes = targetShift
      ? computeShiftOfflineMinutes({
          shift: targetShift,
          dayEvents,
          checkInTime: targetShift.checkInTime,
          checkOutTime: nowIso,
          isToday: true,
          courierStatus: 'offline',
          now,
        })
      : undefined;

    const {error} = await endCourierShiftRecord({
      shift: targetShift,
      profileId: targetProfileId,
      nowIso,
      offlineMinutes,
    });

    if (error) {
      showToast(`تعذر إنهاء الشيفت: ${error}`);
      return;
    }

    setCourier((prev) => (prev ? {...prev, status: 'offline'} : prev));
    if (targetShift) {
      setShifts((prev) =>
        prev.map((s) =>
          s.id === targetShift.id
            ? {
                ...s,
                status: 'completed',
                checkOutTime: nowIso,
                offlineMinutes:
                  typeof offlineMinutes === 'number' ? offlineMinutes : s.offlineMinutes,
              }
            : s
        )
      );
    }

    showToast('تم إنهاء الشيفت وتسجيل وقت الانصراف');
  };

  const handleAcceptOrder = async (order: CourierOrder) => {
    if (!courier) return;
    if (custodyBalance >= CASH_LOCK_LIMIT_EGP) {
      showToast('يجب توريد المبلغ لفتح الحساب');
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      enqueueOfflineStatusUpdate({
        type: 'accept_order',
        orderId: order.id,
        status: 'confirmed_by_courier',
      });
      setOrders((prev) =>
        prev.map((item) =>
          item.id === order.id ? {...item, status: 'confirmed_by_courier'} : item
        )
      );
      showToast('لا يوجد إنترنت — تم حفظ موافقتك وسيتم إرسالها عند عودة الاتصال');
      return;
    }

    const {nextStatus, error} = await acceptAssignedOrderRecord(order.id);
    if (error) {
      if (isLikelyOfflineError(error)) {
        enqueueOfflineStatusUpdate({
          type: 'accept_order',
          orderId: order.id,
          status: 'confirmed_by_courier',
        });
        setOrders((prev) =>
          prev.map((item) =>
            item.id === order.id ? {...item, status: 'confirmed_by_courier'} : item
          )
        );
        showToast('انقطع الاتصال — تم حفظ موافقتك وسيتم إرسالها عند عودة الإنترنت');
        return;
      }
      showToast(`تعذر تأكيد قبول الطلب: ${error}`);
      return;
    }

    setOrders((prev) =>
      prev.map((item) =>
        item.id === order.id ? {...item, status: nextStatus} : item
      )
    );
    showToast('تمت الموافقة على الطلب، يمكنك الآن التوجه للاستلام');
  };

  const handleRejectOrder = async (order: CourierOrder) => {
    if (!courier) return;

    const {error} = await rejectAssignedOrderRecord(order, courier.id);
    if (error) {
      showToast(`تعذر رفض الطلب: ${error}`);
      return;
    }

    setOrders((prev) => prev.filter((item) => item.id !== order.id));
    showToast('تم رفض الطلب، سيتم تحويله لمندوب آخر.');
    setActiveTab('home');
  };

  const finalizeOrderDelivery = async (
    order: CourierOrder,
    proofUrls: DeliveryProofUrls
  ): Promise<string | null> => {
    if (!courier) return 'تعذر تحديد بيانات المندوب';
    if (custodyBalance >= CASH_LOCK_LIMIT_EGP) {
      const msg = 'يجب توريد المبلغ لفتح الحساب';
      showToast(msg);
      return msg;
    }

    const percentage = await fetchCourierCommissionPercentage();
    const feeNet = order.deliveryFeeNet;
    const commission = Number((feeNet * (percentage / 100)).toFixed(2));
    const hatlyRevenue = Number((feeNet - commission).toFixed(2));
    const method = order.paymentMethod.trim().toLowerCase();
    const isCash = method === 'cash';

    const orderUpdatePayload: Record<string, unknown> = {
      status: 'delivered',
      courier_commission: commission,
      hatly_net_revenue: hatlyRevenue,
      delivery_photo_1: proofUrls.deliveryPhoto1,
      delivery_photo_2: proofUrls.deliveryPhoto2,
      delivery_photo_3: proofUrls.deliveryPhoto3,
    };

    if (isCash) {
      orderUpdatePayload.is_cash_collected = true;
    }

    const {error: orderErr} = await supabase
      .from('orders')
      .update(orderUpdatePayload)
      .eq('id', order.id);

    if (orderErr) {
      return `فشل تحديث حالة الطلب: ${orderErr.message}`;
    }

    setOrderLocallyPickupEnroute(order.id, false);

    const updatedOrders = orders.map((item) =>
      item.id === order.id
        ? {
            ...item,
            status: 'delivered' as OrderStatus,
            courierCommission: commission,
            hatlyNetRevenue: hatlyRevenue,
            isCashCollected: isCash ? true : item.isCashCollected,
            deliveryPhoto1: proofUrls.deliveryPhoto1,
            deliveryPhoto2: proofUrls.deliveryPhoto2,
            deliveryPhoto3: proofUrls.deliveryPhoto3,
          }
        : item
    );
    setOrders(updatedOrders);

    const nextCustody = calculateCustodyBalance(updatedOrders, deposits);

    if (isCash) {
      const updatePayload: Record<string, unknown> = {
        [courier.cashColumnKey]: nextCustody,
      };
      if (nextCustody >= CASH_LOCK_LIMIT_EGP) {
        updatePayload.status = 'offline';
      }
      const {error: courierErr} = await supabase
        .from('couriers')
        .update(updatePayload)
        .eq('profile_id', courier.profileId);

      if (!courierErr) {
        setCourier((prev) =>
          prev
            ? {
                ...prev,
                cashCustody: nextCustody,
                status: nextCustody >= CASH_LOCK_LIMIT_EGP ? 'offline' : prev.status,
              }
            : prev
        );
      }
    }

    setDeliveryProofTargetOrder(null);

    if (authUser) {
      await loadCourierBundle(authUser);
    }

    showToast('تم تسليم الطلب وتحديث العهدة النقدية');
    return null;
  };

  const handleAdvanceOrderStatus = async (
    order: CourierOrder,
    nextStatus: OrderStatus
  ) => {
    if (!courier) return;
    if (custodyBalance >= CASH_LOCK_LIMIT_EGP) {
      showToast('يجب توريد المبلغ لفتح الحساب');
      return;
    }

    // Mandatory 3 delivery proof photos before marking order delivered
    if (nextStatus === 'delivered') {
      setDeliveryProofTargetOrder(order);
      return;
    }

    const isConnected = typeof navigator === 'undefined' ? true : navigator.onLine;
    const percentage = isConnected ? await fetchCourierCommissionPercentage() : 70;
    const feeNet = order.deliveryFeeNet;
    const commission = Number((feeNet * (percentage / 100)).toFixed(2));
    const hatlyRevenue = Number((feeNet - commission).toFixed(2));

    const orderUpdatePayload: Record<string, unknown> = {
      status: nextStatus,
      courier_commission: commission,
      hatly_net_revenue: hatlyRevenue,
    };

    const applyOptimisticAndQueue = () => {
      enqueueOfflineStatusUpdate({
        type: 'order_status',
        orderId: order.id,
        status: nextStatus,
        payload: orderUpdatePayload,
      });
      if (nextStatus === 'on_the_way_to_pickup') {
        setOrderLocallyPickupEnroute(order.id, true);
      } else {
        setOrderLocallyPickupEnroute(order.id, false);
      }
      setOrders((prev) =>
        prev.map((item) =>
          item.id === order.id
            ? {
                ...item,
                status: nextStatus,
                courierCommission: commission,
                hatlyNetRevenue: hatlyRevenue,
              }
            : item
        )
      );
      showToast('لا يوجد إنترنت — تم حفظ تحديث الحالة وسيتم إرساله فور عودة الاتصال');
    };

    if (!isConnected) {
      applyOptimisticAndQueue();
      return;
    }

    const {error: orderErr} = await supabase
      .from('orders')
      .update(orderUpdatePayload)
      .eq('id', order.id);

    if (orderErr) {
      if (isLikelyOfflineError(orderErr.message)) {
        applyOptimisticAndQueue();
        return;
      }

      const msg = orderErr.message.toLowerCase();
      const isEnumOrConstraintError =
        msg.includes('check') || msg.includes('enum') || msg.includes('constraint');

      if (nextStatus === 'on_the_way_to_pickup' && isEnumOrConstraintError) {
        setOrderLocallyPickupEnroute(order.id, true);
      } else {
        showToast(`فشل تحديث حالة الطلب: ${orderErr.message}`);
        return;
      }
    } else {
      setOrderLocallyPickupEnroute(order.id, false);
    }

    const updatedOrders = orders.map((item) =>
      item.id === order.id
        ? {
            ...item,
            status: nextStatus,
            courierCommission: commission,
            hatlyNetRevenue: hatlyRevenue,
          }
        : item
    );
    setOrders(updatedOrders);

    if (nextStatus === 'on_the_way_to_pickup') {
      showToast('أنت الآن في الطريق لاستلام الطلب من التاجر');
    } else if (nextStatus === 'picked_up') {
      showToast('تم تأكيد الاستلام من التاجر');
    } else if (nextStatus === 'on_the_way') {
      showToast('تم تحديث الحالة: في الطريق للعميل');
    }
  };

  const handleRefreshAll = async () => {
    if (!authUser) return;
    await loadCourierBundle(authUser);
    showToast('تم تحديث البيانات');
  };

  if (!authReady || (authUser && (mfaStage === 'idle' || mfaStage === 'checking'))) {
    return (
      <div className="min-h-screen bg-[#0A192F] flex flex-col items-center justify-center gap-4 text-white">
        <HatlyLogo size="lg" light />
        <p className="text-sm text-slate-300">جاري التحقق من أمان الحساب...</p>
      </div>
    );
  }

  if (!authUser) {
    return (
      <>
        <LoginView
          onLogin={handleLogin}
          pendingCourier={null}
          noProfileFound={false}
          onRefreshProfile={async () => {}}
          onSignOut={handleSignOut}
          loading={loadingData}
        />
        <OfflineIndicator />
      </>
    );
  }

  if (mfaStage === 'enroll_required') {
    return (
      <>
        <MfaEnrollmentView
          userEmail={authUser.email ?? ''}
          onEnrolled={async () => {
            const {data} = await supabase.auth.getUser();
            await evaluateMfaAndLoad(data?.user ?? authUser);
          }}
          onSignOut={handleSignOut}
        />
        <OfflineIndicator />
      </>
    );
  }

  if (mfaStage === 'challenge_required') {
    return (
      <>
        <MfaChallengeView
          factorId={mfaFactorId}
          userEmail={authUser.email ?? ''}
          initialError={mfaError}
          onVerified={async () => {
            const {data} = await supabase.auth.getUser();
            await evaluateMfaAndLoad(data?.user ?? authUser);
          }}
          onSignOut={handleSignOut}
        />
        <OfflineIndicator />
      </>
    );
  }

  if (!courier || courier.accountStatus !== 'active') {
    return (
      <>
        <LoginView
          onLogin={handleLogin}
          pendingCourier={courier}
          noProfileFound={noProfileFound}
          onRefreshProfile={async () => {
            await loadCourierBundle(authUser);
          }}
          onSignOut={handleSignOut}
          loading={loadingData}
        />
        <OfflineIndicator />
      </>
    );
  }

  const {activeOrders, deliveredOrders} = summarizeAndFilterOrders(orders);
  const completedCount = deliveredOrders.length;
  const isAccountLocked = custodyBalance >= CASH_LOCK_LIMIT_EGP;
  const unreadNotificationsCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="min-h-screen bg-[#F6F8FB] pb-24 md:pb-10">
      {/* Compact Sticky Top Bar */}
      <header className="sticky top-0 z-30 bg-[#0A192F] text-white border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <HatlyLogo size="sm" light />

          <nav className="hidden md:flex items-center gap-6 text-sm font-bold">
            {DESKTOP_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`py-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  activeTab === tab.id
                    ? 'text-[#FF7B00] border-b-2 border-[#FF7B00]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton variant="compact" />
            <button
              type="button"
              onClick={() => void handleOpenNotifications()}
              aria-label="الإشعارات"
              className="relative min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            >
              <Bell className="h-4.5 w-4.5" />
              {unreadNotificationsCount > 0 && (
                <span
                  data-testid="unread-notifications-badge"
                  className="absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-extrabold leading-none flex items-center justify-center tabular-nums ring-2 ring-[#0A192F]"
                >
                  {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => void handleRefreshAll()}
              disabled={loadingData}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              aria-label="تحديث البيانات"
            >
              <RefreshCw className={`h-4 w-4 ${loadingData ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-5">
        <ErrorBoundary
          key={activeTab}
          fallbackTitle="تعذر عرض هذا القسم"
          onReset={() => {
            if (authUser) void loadCourierBundle(authUser);
          }}
        >
          {activeTab === 'home' && (
            <HomeView
              courier={courier}
              custodyBalance={custodyBalance}
              activeOrders={activeOrders}
              shifts={shifts}
              loadingShifts={loadingData}
              activeCheckedInShift={activeCheckedInShift}
              nextEligibleShift={nextEligibleShift}
              gpsError={gpsError}
              lastGpsSync={lastGpsSync}
              onToggleAvailability={handleToggleAvailability}
              onEndShift={handleEndShift}
              onAcceptOrder={handleAcceptOrder}
              onRejectOrder={handleRejectOrder}
              onAdvanceOrderStatus={handleAdvanceOrderStatus}
              onRequestDeliveryProof={(order) => setDeliveryProofTargetOrder(order)}
              onRequestCancel={(order) => setCancelTargetOrder(order)}
              onOpenDeposit={() => setDepositOpen(true)}
              onOpenOrdersTab={() => setActiveTab('orders')}
              onOpenShiftsTab={() => setActiveTab('shifts')}
              onStartCheckIn={(shift) => setCheckInShift(shift)}
            />
          )}

          {activeTab === 'shifts' && (
            <ShiftsView
              shifts={shifts}
              orders={orders}
              statusEvents={shiftEvents}
              courierStatus={courier.status}
              onStartCheckIn={(shift) => setCheckInShift(shift)}
              onEndShift={handleEndShift}
            />
          )}

          {activeTab === 'orders' && (
            <OrdersView
              courier={courier}
              orders={orders}
              isAccountLocked={isAccountLocked}
              onAcceptOrder={handleAcceptOrder}
              onRejectOrder={handleRejectOrder}
              onAdvanceOrderStatus={handleAdvanceOrderStatus}
              onRequestDeliveryProof={(order) => setDeliveryProofTargetOrder(order)}
              onRequestCancel={(order) => setCancelTargetOrder(order)}
              onRefreshOrders={refreshOrdersOnly}
            />
          )}

          {activeTab === 'wallet' && (
            <WalletView
              custodyBalance={custodyBalance}
              deposits={deposits}
              onOpenDeposit={() => setDepositOpen(true)}
            />
          )}

          {activeTab === 'profile' && (
            <ProfileView
              courier={courier}
              completedCount={completedCount}
              onSignOut={handleSignOut}
            />
          )}
        </ErrorBoundary>
      </main>

      {/* Shift Selfie Check-In Modal */}
      {checkInShift && (
        <ShiftCheckInSheet
          courier={courier}
          shift={checkInShift}
          onClose={() => setCheckInShift(null)}
          onSuccess={async (payload) => {
            if (payload) {
              setShifts((prev) =>
                prev.map((s) =>
                  s.id === payload.shiftId
                    ? {
                        ...s,
                        checkInPhotoUrl: payload.photoUrl,
                        checkInTime: payload.checkInTime,
                        status: payload.status,
                        lateMinutes: payload.lateMinutes,
                      }
                    : s
                )
              );
            }
            setShiftEvents(loadShiftStatusEvents(courier.id));
            if (authUser) await loadCourierBundle(authUser);
          }}
        />
      )}

      {/* Deposit Receipt Upload Modal */}
      {depositOpen && (
        <DepositSheet
          courier={courier}
          remainingBalance={custodyBalance}
          onClose={() => setDepositOpen(false)}
          onSuccess={async (createdDeposit) => {
            await refreshDepositsOnly(createdDeposit);
            if (createdDeposit) {
              const nextCustody = Math.max(
                0,
                Number((custodyBalance - Number(createdDeposit.amount || 0)).toFixed(2))
              );
              setCourier((prev) =>
                prev ? {...prev, cashCustody: nextCustody} : prev
              );
            }
            if (authUser) {
              const {courier: refreshedProfile} = await fetchCourierByAuthUser(authUser);
              if (refreshedProfile) {
                setCourier(refreshedProfile);
              }
            }
          }}
        />
      )}

      {/* Mandatory Delivery Proof Modal (3 photos) */}
      {deliveryProofTargetOrder && (
        <DeliveryProofModal
          order={deliveryProofTargetOrder}
          courier={courier}
          onClose={() => setDeliveryProofTargetOrder(null)}
          onConfirmDelivery={finalizeOrderDelivery}
        />
      )}

      {/* Order Cancellation Modal */}
      {cancelTargetOrder && (
        <CancelOrderModal
          order={cancelTargetOrder}
          courier={courier}
          onClose={() => setCancelTargetOrder(null)}
          onSuccess={async (updatedFields) => {
            const targetId = cancelTargetOrder.id;
            selfCancelledOrderIdsRef.current.add(targetId);
            setOrders((prev) =>
              prev.map((item) =>
                item.id === targetId
                  ? {
                      ...item,
                      status: 'cancelled',
                      isCashCollected: false,
                      cancelReason: updatedFields.cancelReason,
                      cancelProofUrl: updatedFields.cancelProofUrl,
                      cancelledAt: updatedFields.cancelledAt,
                      cancelledBy: updatedFields.cancelledBy,
                    }
                  : item
              )
            );
            setCancelTargetOrder(null);
            showToast('تم إلغاء التسليم بنجاح');
            if (authUser) await loadCourierBundle(authUser);
          }}
        />
      )}

      {/* Notifications Modal */}
      {notificationsOpen && (
        <NotificationsModal
          notifications={notifications}
          highlightedUnreadIds={highlightedUnreadIds}
          loading={loadingNotifications}
          onRefresh={refreshNotificationsOnly}
          onClose={() => {
            setNotificationsOpen(false);
            setHighlightedUnreadIds(new Set());
          }}
        />
      )}

      {/* Toast Notification */}
      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-16 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-50 rounded-xl bg-[#0A192F] text-white border border-[#FF7B00]/40 px-4 py-3 text-xs sm:text-sm font-bold shadow-xl text-center"
        >
          {toastMsg}
        </div>
      )}

      <OfflineIndicator />

      <BottomNav
        activeTab={activeTab}
        activeOrdersCount={activeOrders.length}
        onChangeTab={setActiveTab}
      />
    </div>
  );
}
