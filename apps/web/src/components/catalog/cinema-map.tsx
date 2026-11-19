"use client";

import { ExternalLink, MapPin, Navigation } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { buildDirectionsUrl, hasValidCoordinates } from "@/lib/map-links";
import { cn } from "@/lib/utils";

import { buildCinemaPopup } from "./cinema-map-popup";
import styles from "./cinema-map.module.css";

export interface CinemaMapProps {
  latitude: number | null;
  longitude: number | null;
  cinemaName: string;
  address: string;
  className?: string;
}

/**
 * Bản đồ vị trí rạp chiếu Leaflet + tile OpenStreetMap France (R-34, R-37).
 * - Lazy load Leaflet ở phía client, không chạy khi SSR, không chặn LCP.
 * - TUYỆT ĐỐI KHÔNG gọi navigator.geolocation và không lưu toạ độ người dùng (NFR-08 / R-36).
 * - Cung cấp liên kết mở chỉ đường trực tiếp trên Google Maps.
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

  const hasCoords = hasValidCoordinates(latitude, longitude);

  const directionsUrl = buildDirectionsUrl({ latitude, longitude, name: cinemaName, address });

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

        // Tile OSM France: tile.openstreetmap.org bị DNS nhà mạng VN chặn, CARTO đóng dấu "API KEY REQUIRED"
        L.tileLayer("https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>, tiles by <a href="https://www.openstreetmap.fr/" target="_blank" rel="noopener noreferrer">OpenStreetMap France</a>',
          subdomains: "abc",
          maxZoom: 20,
        }).addTo(map);

        // Marker vàng chamfer (token brand), glyph tối; bóng đổ ở lớp ngoài vì clip-path cắt box-shadow.
        const customPinHtml = `
          <div style="filter: drop-shadow(0 4px 6px rgb(0 0 0 / 0.55)); cursor: pointer;">
            <div style="display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; background: var(--color-brand); color: var(--color-fg-on-brand); clip-path: polygon(0 0, calc(100% - 9px) 0, 100% 9px, 100% 100%, 9px 100%, 0 calc(100% - 9px));">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0Z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
            </div>
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

        marker.bindPopup(buildCinemaPopup(cinemaName, address, directionsUrl), { className: styles.popup });
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
      <div className={cn("frame", className)}>
        <div className="frame-in flex flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="chamfer-md flex size-12 items-center justify-center bg-surface-elevated text-fg-muted">
            <MapPin className="size-6 text-fg-muted" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-heading text-body font-semibold uppercase text-fg">Vị trí rạp</h3>
            <p className="mt-1 max-w-sm text-body-sm text-fg-secondary">{address}</p>
          </div>
          <Button asChild variant="secondary" size="sm" className="mt-2">
            <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" aria-hidden="true" />
              Tìm địa chỉ trên Google Maps
            </a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("frame", styles.map, className)}>
      <div className="frame-in relative overflow-hidden">
        {!isLoaded ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-surface p-4">
            <Skeleton className="h-full w-full rounded-none" />
          </div>
        ) : null}

        <div
          ref={containerRef}
          aria-label={`Bản đồ vị trí rạp ${cinemaName}`}
          role="region"
          className="h-80 w-full min-h-[320px] md:h-96"
        />

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-elevated px-4 py-3">
          <div className="flex items-center gap-2 text-body-sm text-fg-secondary">
            <MapPin className="size-4 shrink-0 text-brand" aria-hidden="true" />
            <span className="truncate font-medium text-fg">{address}</span>
          </div>
          <Button asChild variant="secondary" size="sm" className="shrink-0">
            <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
              <Navigation className="size-4" aria-hidden="true" />
              Mở chỉ đường (Google Maps)
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
