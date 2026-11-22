import React, {useEffect, useRef} from 'react';
import L from 'leaflet';
import {Navigation} from 'lucide-react';

export type CourierMapMode = 'pickup' | 'delivery' | 'both';

interface CourierMapProps {
  mode?: CourierMapMode;
  pickupLat: number | null;
  pickupLng: number | null;
  pickupLabel?: string;
  deliveryLat: number | null;
  deliveryLng: number | null;
  deliveryLabel?: string;
  courierLat: number | null;
  courierLng: number | null;
  heightClass?: string;
}

const DEFAULT_CAIRO_CENTER: [number, number] = [30.0444, 31.2357];

function isValidCoordPair(lat: number | null, lng: number | null): boolean {
  return (
    typeof lat === 'number' &&
    Number.isFinite(lat) &&
    typeof lng === 'number' &&
    Number.isFinite(lng) &&
    (Math.abs(lat) > 0.0001 || Math.abs(lng) > 0.0001)
  );
}

function createPinIcon(label: string, bgColor: string, borderColor: string) {
  return L.divIcon({
    className: 'hatly-map-pin',
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);">
        <div style="background:${bgColor};color:#ffffff;font-family:Cairo,sans-serif;font-size:11px;font-weight:700;padding:3px 8px;border-radius:8px;border:2px solid ${borderColor};white-space:nowrap;box-shadow:0 4px 10px rgba(10,25,47,0.28);">
          ${label}
        </div>
        <div style="width:10px;height:10px;background:${bgColor};border:2px solid #ffffff;border-radius:9999px;margin-top:2px;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function createCourierIcon() {
  return L.divIcon({
    className: 'hatly-courier-pin',
    html: `
      <div style="transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;">
        <div style="width:18px;height:18px;border-radius:9999px;background:#0A192F;border:3px solid #FF7B00;box-shadow:0 0 0 4px rgba(255,123,0,0.25);"></div>
      </div>
    `,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

export const CourierMap: React.FC<CourierMapProps> = ({
  mode = 'both',
  pickupLat,
  pickupLng,
  pickupLabel = 'الاستلام',
  deliveryLat,
  deliveryLng,
  deliveryLabel = 'التسليم',
  courierLat,
  courierLng,
  heightClass = 'h-[250px]',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const hasPickup = isValidCoordPair(pickupLat, pickupLng);
  const hasDelivery = isValidCoordPair(deliveryLat, deliveryLng);
  const hasCourier = isValidCoordPair(courierLat, courierLng);

  // If pickup mode is requested but pickup coords are missing while customer coords exist,
  // still display the customer's location marker so valid order coordinates always show a map.
  const showPickupPin =
    (mode === 'pickup' && hasPickup) || (mode === 'both' && hasPickup);
  const showDeliveryPin =
    (mode === 'delivery' && hasDelivery) ||
    (mode === 'both' && hasDelivery) ||
    (mode === 'pickup' && !hasPickup && hasDelivery);

  const targetCoords: {lat: number; lng: number} | null =
    mode === 'pickup'
      ? hasPickup
        ? {lat: pickupLat as number, lng: pickupLng as number}
        : hasDelivery
          ? {lat: deliveryLat as number, lng: deliveryLng as number}
          : null
      : mode === 'delivery'
        ? hasDelivery
          ? {lat: deliveryLat as number, lng: deliveryLng as number}
          : null
        : hasDelivery
          ? {lat: deliveryLat as number, lng: deliveryLng as number}
          : hasPickup
            ? {lat: pickupLat as number, lng: pickupLng as number}
            : null;

  const hasRequiredCoords = targetCoords !== null;

  useEffect(() => {
    const container = containerRef.current;
    if (!hasRequiredCoords || !container || mapRef.current) return;

    let resizeObserver: ResizeObserver | null = null;
    try {
      const map = L.map(container, {
        center: DEFAULT_CAIRO_CENTER,
        zoom: 14,
        zoomControl: false,
        attributionControl: false,
        zoomAnimation: false,
        fadeAnimation: false,
        markerZoomAnimation: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      const group = L.layerGroup().addTo(map);
      mapRef.current = map;
      layerGroupRef.current = group;

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          if (mapRef.current !== map) return;
          try {
            if (map.getContainer()?.isConnected) {
              map.invalidateSize({animate: false});
            }
          } catch {
            // ignore resize error
          }
        });
        resizeObserver.observe(container);
      }

      return () => {
        resizeObserver?.disconnect();
        mapRef.current = null;
        layerGroupRef.current = null;
        try {
          map.stop();
          map.remove();
        } catch {
          // ignore cleanup error
        }
      };
    } catch (err) {
      console.error('[Hatly Map] Failed to initialize Leaflet map:', err);
      return undefined;
    }
  }, [hasRequiredCoords]);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!hasRequiredCoords || !map || !group) return;

    const timerIds: number[] = [];
    try {
      group.clearLayers();
      const boundsPoints: L.LatLngTuple[] = [];

      if (showPickupPin && hasPickup && pickupLat !== null && pickupLng !== null) {
        const pt: L.LatLngTuple = [pickupLat, pickupLng];
        boundsPoints.push(pt);
        L.marker(pt, {
          icon: createPinIcon('الاستلام', '#0A192F', '#FFFFFF'),
        })
          .bindPopup(`<strong>نقطة الاستلام</strong><br/>${pickupLabel}`)
          .addTo(group);
      }

      if (showDeliveryPin && hasDelivery && deliveryLat !== null && deliveryLng !== null) {
        const pt: L.LatLngTuple = [deliveryLat, deliveryLng];
        boundsPoints.push(pt);
        L.marker(pt, {
          icon: createPinIcon('التسليم', '#FF7B00', '#FFFFFF'),
        })
          .bindPopup(`<strong>نقطة التسليم</strong><br/>${deliveryLabel}`)
          .addTo(group);
      }

      if (
        mode === 'both' &&
        hasPickup &&
        hasDelivery &&
        pickupLat !== null &&
        pickupLng !== null &&
        deliveryLat !== null &&
        deliveryLng !== null
      ) {
        L.polyline(
          [
            [pickupLat, pickupLng],
            [deliveryLat, deliveryLng],
          ],
          {
            color: '#0A192F',
            weight: 3,
            dashArray: '6, 8',
            opacity: 0.7,
          }
        ).addTo(group);
      }

      if (hasCourier && courierLat !== null && courierLng !== null) {
        const pt: L.LatLngTuple = [courierLat, courierLng];
        boundsPoints.push(pt);
        L.marker(pt, {
          icon: createCourierIcon(),
        })
          .bindPopup('<strong>موقعك الحالي</strong>')
          .addTo(group);
      }

      const recenter = () => {
        if (mapRef.current !== map) return;
        try {
          if (!map.getContainer()?.isConnected) return;
          map.invalidateSize({animate: false});
          if (boundsPoints.length >= 2) {
            map.fitBounds(L.latLngBounds(boundsPoints), {
              padding: [36, 36],
              maxZoom: 15,
              animate: false,
            });
          } else if (boundsPoints.length === 1) {
            map.setView(boundsPoints[0], 15, {animate: false});
          } else {
            map.setView(DEFAULT_CAIRO_CENTER, 12, {animate: false});
          }
        } catch {
          // ignore
        }
      };

      recenter();
      timerIds.push(window.setTimeout(recenter, 150));
      timerIds.push(window.setTimeout(recenter, 350));
    } catch (err) {
      console.error('[Hatly Map] Failed to render markers:', err);
    }

    return () => {
      for (const id of timerIds) {
        window.clearTimeout(id);
      }
    };
  }, [
    hasRequiredCoords,
    mode,
    showPickupPin,
    showDeliveryPin,
    hasPickup,
    hasDelivery,
    hasCourier,
    pickupLat,
    pickupLng,
    pickupLabel,
    deliveryLat,
    deliveryLng,
    deliveryLabel,
    courierLat,
    courierLng,
  ]);

  if (!hasRequiredCoords) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-[#F6F8FB] p-4 text-center">
        <p className="text-xs sm:text-sm font-bold text-[#0A192F] leading-relaxed">
          الإحداثيات غير متوفرة، يرجى الاعتماد على العنوان المكتوب ورقم الهاتف.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
        <div
          ref={containerRef}
          className={`hatly-leaflet-map w-full ${heightClass}`}
        />
      </div>

      <a
        href={`https://www.google.com/maps/dir/?api=1&destination=${targetCoords.lat},${targetCoords.lng}`}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-[#0A192F] px-4 py-2.5 text-xs sm:text-sm font-extrabold text-white hover:bg-[#13294B] transition-colors"
      >
        <Navigation className="h-4 w-4 text-[#FF7B00] shrink-0" />
        <span>فتح في خرائط جوجل</span>
      </a>
    </div>
  );
};
