"use client";

import { ExternalLink, MapPin, Navigation } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { buildCinemaPopup } from "./cinema-map-popup";

export interface CinemaMapProps {
  latitude: number | null;
  longitude: number | null;
  cinemaName: string;
  address: string;
  className?: string;
}

/**
 * Bản đồ vị trí rạp chiếu OpenStreetMap / Leaflet (R-34, R-37).
 * - Lazy load Leaflet ở phía client, không chạy khi SSR, không chặn LCP.
 * - TUYỆT ĐỐI KHÔNG gọi navigator.geolocation và không lưu toạ độ người dùng (NFR-08 / R-36).
 * - Cung cấp liên kết mở chỉ đường trực tiếp trên OpenStreetMap.
 */
export function CinemaMap({
  latitude,
  longitude,
  cinemaName,
  address,
  className,
}: Readonly<CinemaMapProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const hasCoords =
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    !Number.isNaN(latitude) &&
    !Number.isNaN(longitude);

  // Link chỉ đường tới toạ độ rạp trên OpenStreetMap
  const directionsUrl = hasCoords
    ? `https://www.openstreetmap.org/directions?to=${latitude}%2C${longitude}`
    : `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${cinemaName} ${address}`)}`;

  useEffect(() => {
    if (!hasCoords || !containerRef.current) return;

    let isSubscribed = true;

    async function initMap() {
      try {
        // Tải động Leaflet và CSS ở phía client
        const L = await import("leaflet");
        await import("leaflet/dist/leaflet.css");

        if (!isSubscribed || !containerRef.current) return;

        // Nếu đã có map instance cũ thì dọn dẹp trước
        if (mapInstanceRef.current) {
          (mapInstanceRef.current as { remove: () => void }).remove();
          mapInstanceRef.current = null;
        }

        const map = L.map(containerRef.current, {
          center: [latitude as number, longitude as number],
          zoom: 15,
          scrollWheelZoom: false,
        });

        mapInstanceRef.current = map;

        // Thêm lớp bản đồ nền OpenStreetMap
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map);

        // Marker icon tùy biến dùng SVG màu brand CINEMO (#F06D5B), không bị phụ thuộc ảnh tĩnh của Leaflet
        const customPinHtml = `
          <div style="
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: #F06D5B;
            border: 2px solid #FFFFFF;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            cursor: pointer;
          ">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0Z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
        `;

        const pinIcon = L.divIcon({
          html: customPinHtml,
          className: "cinemo-custom-pin",
          iconSize: [36, 36],
          iconAnchor: [18, 18],
          popupAnchor: [0, -20],
        });

        const marker = L.marker([latitude as number, longitude as number], {
          icon: pinIcon,
          title: cinemaName,
        }).addTo(map);

        marker.bindPopup(buildCinemaPopup(cinemaName, address, directionsUrl));
        setIsLoaded(true);
      } catch (err) {
        console.error("Failed to initialize Leaflet map:", err);
        if (isSubscribed) {
          setHasError(true);
        }
      }
    }

    initMap();

    return () => {
      isSubscribed = false;
      if (mapInstanceRef.current) {
        try {
          (mapInstanceRef.current as { remove: () => void }).remove();
        } catch {
          // ignore
        }
        mapInstanceRef.current = null;
      }
    };
  }, [hasCoords, latitude, longitude, cinemaName, address, directionsUrl]);

  if (!hasCoords || hasError) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-lg border border-border-subtle bg-surface p-6 text-center",
          className,
        )}
      >
        <div className="flex size-12 items-center justify-center rounded-pill bg-surface-elevated text-fg-muted">
          <MapPin className="size-6 text-fg-muted" aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-body font-semibold text-fg">Vị trí rạp</h3>
          <p className="mt-1 max-w-sm text-body-sm text-fg-secondary">{address}</p>
        </div>
        <Button asChild variant="secondary" size="sm" className="mt-2">
          <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4" aria-hidden="true" />
            Tìm địa chỉ trên OpenStreetMap
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden rounded-lg border border-border-subtle bg-surface", className)}>
      {!isLoaded ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-surface p-4">
          <Skeleton className="h-full w-full rounded-md" />
        </div>
      ) : null}

      <div
        ref={containerRef}
        aria-label={`Bản đồ vị trí rạp ${cinemaName}`}
        role="region"
        className="h-80 w-full min-h-[320px] rounded-lg md:h-96"
      />

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle bg-surface-elevated px-4 py-3">
        <div className="flex items-center gap-2 text-body-sm text-fg-secondary">
          <MapPin className="size-4 shrink-0 text-brand" aria-hidden="true" />
          <span className="truncate font-medium text-fg">{address}</span>
        </div>
        <Button asChild variant="secondary" size="sm" className="shrink-0">
          <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
            <Navigation className="size-4" aria-hidden="true" />
            Mở chỉ đường (OpenStreetMap)
          </a>
        </Button>
      </div>
    </div>
  );
}
