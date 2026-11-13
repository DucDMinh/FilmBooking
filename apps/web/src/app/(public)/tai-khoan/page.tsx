"use client";

import type { IdentityListResponse } from "@filmbooking/shared/schemas/identity";
import { useEffect, useState } from "react";

import { ChangePasswordForm } from "@/components/account/change-password-form";
import { ProfileForm, type ProfileData } from "@/components/account/profile-form";
import { ErrorState } from "@/components/common/states";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api/client";

function ProfileLoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-lg border border-border-subtle bg-surface p-6">
        <Skeleton className="h-6 w-44" />
        <div className="flex items-center gap-4">
          <Skeleton className="size-20 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
        <div className="space-y-3 pt-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}

export default function AccountProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [hasPassword, setHasPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfileData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileData, identitiesData] = await Promise.all([
        apiFetch<ProfileData>("/me/profile"),
        apiFetch<IdentityListResponse>("/me/identities").catch(() => null),
      ]);
      setProfile(profileData);

      if (identitiesData) {
        setHasPassword(Boolean(identitiesData.hasPassword));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải thông tin hồ sơ.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfileData();
  }, []);

  if (loading) return <ProfileLoadingSkeleton />;

  if (error || !profile) {
    return (
      <ErrorState
        title="Không tải được hồ sơ"
        description={error ?? "Đã có lỗi xảy ra khi tải thông tin tài khoản."}
        onRetry={fetchProfileData}
      />
    );
  }

  return (
    <div className="space-y-8">
      {/* Form thông tin cá nhân & vùng nguy hiểm */}
      <ProfileForm initialProfile={profile} hasPassword={hasPassword} />

      {/* Đổi mật khẩu (chỉ hiển thị nếu tài khoản có mật khẩu) */}
      {hasPassword && profile.email ? (
        <ChangePasswordForm userEmail={profile.email} />
      ) : null}
    </div>
  );
}
