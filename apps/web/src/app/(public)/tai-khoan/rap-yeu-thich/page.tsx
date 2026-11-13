"use client";

import { Heart, Loader2, MapPin, Plus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { EmptyState, ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api/client";
import type { CinemaDto } from "@filmbooking/shared/schemas/catalog";

interface ProfileResponse {
  favorite_cinema_ids?: string[];
}

/**
 * Quản lý danh sách rạp yêu thích của khách (design-spec §15, R-31).
 */
export default function FavoriteCinemasPage() {
  const [cinemas, setCinemas] = useState<CinemaDto[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [selectedCinemaId, setSelectedCinemaId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [cinemasData, profileData] = await Promise.all([
        apiFetch<CinemaDto[]>("/cinemas"),
        apiFetch<ProfileResponse>("/me/profile"),
      ]);
      setCinemas(cinemasData || []);
      setFavoriteIds(profileData?.favorite_cinema_ids || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải danh sách rạp yêu thích.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddFavorite = async () => {
    if (!selectedCinemaId) return;
    setIsUpdating(true);
    try {
      await apiFetch(`/me/favorites/${selectedCinemaId}`, { method: "PUT" });
      setFavoriteIds((prev) => [...prev, selectedCinemaId]);
      const addedCinema = cinemas.find((c) => c.id === selectedCinemaId);
      toast.success(`Đã thêm ${addedCinema?.name ?? "rạp"} vào danh sách yêu thích.`);
      setSelectedCinemaId("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Không thể thêm rạp yêu thích";
      toast.error(msg);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemoveFavorite = async (cinemaId: string) => {
    setIsUpdating(true);
    try {
      await apiFetch(`/me/favorites/${cinemaId}`, { method: "DELETE" });
      setFavoriteIds((prev) => prev.filter((id) => id !== cinemaId));
      const removedCinema = cinemas.find((c) => c.id === cinemaId);
      toast.success(`Đã xoá ${removedCinema?.name ?? "rạp"} khỏi danh sách yêu thích.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Không thể xoá rạp yêu thích";
      toast.error(msg);
    } finally {
      setIsUpdating(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-border-subtle bg-surface">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Không tải được rạp yêu thích"
        description={error}
        onRetry={loadData}
      />
    );
  }

  const favoriteCinemas = cinemas.filter((c) => c.id && favoriteIds.includes(c.id));
  const availableCinemas = cinemas.filter((c) => c.id && !favoriteIds.includes(c.id));

  return (
    <Card className="border-border-subtle bg-surface">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Heart className="size-5 text-brand" aria-hidden="true" />
          <CardTitle>Rạp yêu thích</CardTitle>
        </div>
        <CardDescription>
          Các rạp trong danh sách yêu thích sẽ được ưu tiên hiển thị ở trang chủ và màn hình xem lịch chiếu.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Bộ chọn thêm rạp mới */}
        <div className="rounded-lg border border-border bg-surface-elevated p-4">
          <h2 className="text-body font-semibold text-fg">Thêm rạp yêu thích</h2>
          <p className="mt-1 text-body-sm text-fg-secondary">
            Chọn rạp từ mạng lưới CINEMO toàn quốc để thêm vào danh sách ưu tiên.
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <Select
                value={selectedCinemaId}
                onValueChange={setSelectedCinemaId}
                disabled={isUpdating || availableCinemas.length === 0}
              >
                <SelectTrigger className="w-full bg-surface">
                  <SelectValue
                    placeholder={
                      availableCinemas.length === 0
                        ? "Bạn đã thêm tất cả rạp vào danh sách"
                        : "Chọn rạp để thêm…"
                    }
                  />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  {availableCinemas.map((cinema) => {
                    const id = cinema.id ?? cinema.code;
                    const location = cinema.district || cinema.provinceCode || cinema.address;
                    return (
                      <SelectItem key={id} value={id}>
                        {cinema.name} ({location})
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              variant="default"
              disabled={isUpdating || !selectedCinemaId}
              onClick={handleAddFavorite}
              className="shrink-0"
            >
              {isUpdating ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  <span>Đang xử lý…</span>
                </>
              ) : (
                <>
                  <Plus className="size-4" aria-hidden="true" />
                  <span>Thêm rạp</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Danh sách rạp yêu thích */}
        <div>
          <h2 className="mb-3 text-body font-semibold text-fg">
            Danh sách rạp đã chọn ({favoriteCinemas.length})
          </h2>

          {favoriteCinemas.length === 0 ? (
            <EmptyState
              icon={Heart}
              title="Chưa có rạp yêu thích"
              description="Hãy chọn và thêm các rạp chiếu bạn thường đến ở trên để xem nhanh lịch chiếu."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {favoriteCinemas.map((cinema) => {
                const id = cinema.id ?? cinema.code;
                return (
                  <div
                    key={id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-elevated p-3.5 transition-colors hover:border-brand/40"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/rap/${cinema.code}`}
                        className="truncate text-body font-bold text-fg hover:text-brand"
                      >
                        {cinema.name}
                      </Link>
                      <div className="mt-1 flex items-center gap-1.5 text-small text-fg-muted">
                        <MapPin className="size-3.5 shrink-0 text-brand" aria-hidden="true" />
                        <span className="truncate">{cinema.address}</span>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={isUpdating || !cinema.id}
                      onClick={() => cinema.id && handleRemoveFavorite(cinema.id)}
                      aria-label={`Xoá ${cinema.name} khỏi danh sách yêu thích`}
                      className="size-9 shrink-0 text-fg-muted hover:bg-danger-soft hover:text-danger"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
