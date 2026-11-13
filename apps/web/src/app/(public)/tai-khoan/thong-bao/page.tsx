"use client";

import { Bell, Check, Info, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api/client";

interface ProfileResponse {
  marketing_opt_in?: boolean;
}

/**
 * Tuỳ chọn nhận email khuyến mãi và thông báo (design-spec §15, R-30).
 * Email khuyến mãi là opt-in (mặc định tắt). Email giao dịch luôn được gửi.
 */
export default function AccountNotificationsPage() {
  const [marketingOptIn, setMarketingOptIn] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPreferences = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ProfileResponse>("/me/profile");
      setMarketingOptIn(Boolean(data?.marketing_opt_in));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải cài đặt thông báo.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPreferences();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch("/me/preferences", {
        method: "PUT",
        json: { marketingOptIn },
      });
      toast.success("Cập nhật tuỳ chọn thông báo thành công");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Không thể cập nhật tuỳ chọn";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-border-subtle bg-surface">
        <CardHeader>
          <Skeleton className="h-6 w-52" />
          <Skeleton className="h-4 w-80" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Không tải được cài đặt thông báo"
        description={error}
        onRetry={loadPreferences}
      />
    );
  }

  return (
    <Card className="border-border-subtle bg-surface">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bell className="size-5 text-brand" aria-hidden="true" />
          <CardTitle>Cài đặt thông báo & email</CardTitle>
        </div>
        <CardDescription>
          Tuỳ chỉnh các loại thông báo bạn muốn nhận qua hòm thư điện tử.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Tuỳ chọn email khuyến mãi */}
        <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-elevated p-4">
          <Checkbox
            id="marketing-opt-in"
            checked={marketingOptIn}
            onCheckedChange={(checked) => setMarketingOptIn(checked === true)}
            className="mt-0.5"
          />
          <div className="space-y-1">
            <Label
              htmlFor="marketing-opt-in"
              className="text-body font-semibold text-fg cursor-pointer"
            >
              Nhận email khuyến mãi & tin tức điện ảnh
            </Label>
            <p className="text-body-sm text-fg-secondary">
              Nhận thông tin về các bộ phim bom tấn sắp ra mắt, chương trình ưu đãi vé xem phim và mã giảm giá độc quyền từ CINEMO.
            </p>
          </div>
        </div>

        {/* Thông báo bắt buộc đối với email giao dịch */}
        <div className="flex items-start gap-3 rounded-lg border border-info-line bg-info-soft p-4 text-info">
          <Info className="size-5 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1 text-body-sm leading-normal text-fg-secondary">
            <p className="font-semibold text-fg">Email giao dịch luôn được gửi tự động</p>
            <p>
              Để bảo vệ quyền lợi và bảo mật tài khoản của bạn, các thông báo quan trọng như: mã xác nhận đặt vé, biên lai thanh toán, thông báo thay đổi suất chiếu, và cảnh báo bảo mật tài khoản sẽ luôn được gửi bất kể cài đặt nhận tin khuyến mãi ở trên.
            </p>
          </div>
        </div>

        <div className="pt-2">
          <Button type="button" disabled={saving} onClick={handleSave}>
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                <span>Đang lưu cài đặt…</span>
              </>
            ) : (
              <>
                <Check className="size-4" aria-hidden="true" />
                <span>Lưu thay đổi</span>
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
