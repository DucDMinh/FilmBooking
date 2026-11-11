"use client";

import type { ProvinceDto } from "@filmbooking/shared/schemas/catalog";
import { Check, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const PROVINCE_COOKIE_NAME = "fb_province";

export interface ProvincePickerDialogProps {
  provinces: ProvinceDto[];
  currentProvince?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSelectProvince?: (provinceCode: string) => void;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(^|;\\s*)(${name})=([^;]*)`));
  const val = match?.[3];
  return val ? decodeURIComponent(val) : null;
}

export function setProvinceCookie(code: string): void {
  if (typeof document === "undefined") return;
  // Cookie 365 ngày, SameSite=Lax
  document.cookie = `${PROVINCE_COOKIE_NAME}=${encodeURIComponent(code)}; path=/; max-age=31536000; SameSite=Lax`;
}

export function ProvincePickerDialog({
  provinces,
  currentProvince,
  open: controlledOpen,
  onOpenChange,
  onSelectProvince,
}: Readonly<ProvincePickerDialogProps>) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const [selectedCode, setSelectedCode] = useState<string | null>(currentProvince ?? null);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;

  useEffect(() => {
    // Chỉ tự động kiểm tra nếu không ở chế độ controlled
    if (isControlled) return;

    const cookieVal = getCookie(PROVINCE_COOKIE_NAME);
    if (!cookieVal && !currentProvince) {
      setInternalOpen(true);
    } else {
      setInternalOpen(false);
      if (cookieVal) setSelectedCode(cookieVal);
    }
  }, [isControlled, currentProvince]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!isControlled) {
      setInternalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  };

  const handleSelect = (code: string) => {
    setSelectedCode(code);
    setProvinceCookie(code);
    handleOpenChange(false);
    if (onSelectProvince) {
      onSelectProvince(code);
    } else {
      router.refresh();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid="province-picker-dialog"
        className="sm:max-w-md"
      >
        <DialogHeader>
          <div className="flex items-center gap-2 text-brand">
            <MapPin className="size-5" aria-hidden="true" />
            <DialogTitle>Chọn tỉnh / thành phố</DialogTitle>
          </div>
          <DialogDescription>
            Chọn khu vực để xem lịch chiếu và các cụm rạp gần bạn nhất. Lựa chọn sẽ được ghi nhớ cho các lần truy cập tiếp theo.
          </DialogDescription>
        </DialogHeader>

        <div
          role="group"
          aria-label="Danh sách tỉnh thành phố"
          className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-80 overflow-y-auto py-2"
        >
          {provinces.length > 0 ? (
            provinces.map((prov) => {
              const isSelected = selectedCode === prov.code;
              return (
                <Button
                  key={prov.code}
                  type="button"
                  variant={isSelected ? "default" : "secondary"}
                  onClick={() => handleSelect(prov.code)}
                  className={cn(
                    "h-12 w-full justify-between px-3 text-body-sm font-medium",
                    isSelected && "font-bold shadow-sm",
                  )}
                >
                  <span className="truncate">{prov.name}</span>
                  {isSelected ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
                </Button>
              );
            })
          ) : (
            <div className="col-span-full py-6 text-center text-body-sm text-fg-muted">
              Đang tải danh sách tỉnh thành...
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
