"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api/client";
import { AGE_RATINGS } from "@filmbooking/shared/enums";
import {
  MOVIE_DB_STATUSES,
  createMovieSchema,
  type MovieDto,
} from "@filmbooking/shared/schemas/catalog";

import {
  Field,
  FormSection,
  TextField,
  emptyToNull,
  parseNumber,
  writeErrorToFields,
  splitList,
  zodFieldErrors,
  type FieldErrors,
} from "./form-utils";
import { ImageUploadField } from "./image-upload-field";

/** Phim trong danh sách admin: MovieDto + trạng thái hiển thị (DRAFT/PUBLISHED/ARCHIVED). */
export type AdminMovie = MovieDto & { status: (typeof MOVIE_DB_STATUSES)[number] };

export const MOVIE_STATUS_LABELS: Record<AdminMovie["status"], string> = {
  DRAFT: "Ẩn (nháp)",
  PUBLISHED: "Hiển thị",
  ARCHIVED: "Lưu trữ",
};

interface MovieFormState {
  titleVi: string;
  titleOriginal: string;
  slug: string;
  durationMinutes: string;
  releaseDate: string;
  genres: string;
  ageRating: string;
  director: string;
  cast: string;
  country: string;
  originalLanguage: string;
  subtitleLanguages: string;
  dubbedLanguages: string;
  description: string;
  status: string;
  posterUrl: string;
  bannerUrl: string;
  trailerUrl: string;
}

const join = (items: readonly string[]) => items.join(", ");

function initialState(movie?: AdminMovie): MovieFormState {
  return {
    titleVi: movie?.titleVi ?? "",
    titleOriginal: movie?.titleOriginal ?? "",
    slug: movie?.slug ?? "",
    durationMinutes: movie ? String(movie.durationMinutes) : "",
    releaseDate: movie?.releaseDate ?? "",
    genres: join(movie?.genres ?? []),
    ageRating: movie?.ageRating ?? "",
    director: movie?.director ?? "",
    cast: join(movie?.cast ?? []),
    country: movie?.country ?? "",
    originalLanguage: movie?.originalLanguage ?? "",
    subtitleLanguages: join(movie?.subtitleLanguages ?? []),
    dubbedLanguages: join(movie?.dubbedLanguages ?? []),
    description: movie?.description ?? "",
    status: movie?.status ?? "DRAFT",
    posterUrl: movie?.posterUrl ?? "",
    bannerUrl: movie?.bannerUrl ?? "",
    trailerUrl: movie?.trailerUrl ?? "",
  };
}

/** Slug không dấu từ tên phim (đ -> d) để gợi ý khi tạo mới. */
export function slugify(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildMoviePayload(form: MovieFormState) {
  return {
    slug: form.slug.trim(),
    titleVi: form.titleVi,
    titleOriginal: emptyToNull(form.titleOriginal),
    posterUrl: emptyToNull(form.posterUrl),
    bannerUrl: emptyToNull(form.bannerUrl),
    trailerUrl: emptyToNull(form.trailerUrl),
    description: emptyToNull(form.description),
    genres: splitList(form.genres),
    durationMinutes: parseNumber(form.durationMinutes),
    director: emptyToNull(form.director),
    cast: splitList(form.cast),
    country: emptyToNull(form.country),
    originalLanguage: emptyToNull(form.originalLanguage),
    subtitleLanguages: splitList(form.subtitleLanguages),
    dubbedLanguages: splitList(form.dubbedLanguages),
    releaseDate: form.releaseDate,
    ageRating: form.ageRating,
    status: form.status,
  };
}

/** Form phim (màn 37, R-41/R-42). Chỉ Admin; validate bằng zod schema dùng chung với API. */
export function MovieForm({ movie }: Readonly<{ movie?: AdminMovie }>) {
  const router = useRouter();
  const [form, setForm] = useState<MovieFormState>(() => initialState(movie));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [slugTouched, setSlugTouched] = useState(Boolean(movie));

  const set = <K extends keyof MovieFormState>(key: K) => (value: MovieFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const onTitleChange = (value: string) =>
    setForm((prev) => ({ ...prev, titleVi: value, slug: slugTouched ? prev.slug : slugify(value) }));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = createMovieSchema.safeParse(buildMoviePayload(form));
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await apiFetch(movie ? `/admin/movies/${movie.id}` : "/admin/movies", {
        method: movie ? "PATCH" : "POST",
        json: parsed.data,
      });
      toast.success(movie ? "Đã lưu phim" : "Đã tạo phim");
      router.push("/admin/phim");
    } catch (err) {
      setErrors(writeErrorToFields(err, { field: "slug", message: "Mã phim (slug) đã tồn tại" }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {errors._form ? (
        <p role="alert" className="border border-danger-line bg-danger-soft p-3 text-body-sm text-danger-text">
          {errors._form}
        </p>
      ) : null}

      <FormSection title="Thông tin phim">
        <TextField id="titleVi" label="Tên phim (tiếng Việt)" required value={form.titleVi} onChange={onTitleChange} error={errors.titleVi} />
        <TextField id="titleOriginal" label="Tên gốc" value={form.titleOriginal} onChange={set("titleOriginal")} error={errors.titleOriginal} />
        <TextField
          id="slug"
          label="Mã phim (slug)"
          required
          value={form.slug}
          onChange={(value) => {
            setSlugTouched(true);
            set("slug")(value);
          }}
          error={errors.slug}
          hint="Chữ thường không dấu, nối bằng dấu gạch ngang. Dùng trong đường dẫn /phim/…"
        />
        <TextField id="durationMinutes" label="Thời lượng (phút)" required type="number" inputMode="numeric" value={form.durationMinutes} onChange={set("durationMinutes")} error={errors.durationMinutes} />
        <TextField id="releaseDate" label="Ngày khởi chiếu" required type="date" value={form.releaseDate} onChange={set("releaseDate")} error={errors.releaseDate} />
        <Field id="ageRating" label="Nhãn độ tuổi" required error={errors.ageRating}>
          <Select value={form.ageRating} onValueChange={set("ageRating")}>
            <SelectTrigger id="ageRating" aria-label="Nhãn độ tuổi" aria-invalid={errors.ageRating ? true : undefined}>
              <SelectValue placeholder="Chọn nhãn" />
            </SelectTrigger>
            <SelectContent>
              {AGE_RATINGS.map((rating) => (
                <SelectItem key={rating} value={rating}>
                  {rating}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <TextField id="genres" label="Thể loại" value={form.genres} onChange={set("genres")} error={errors.genres} hint="Ngăn cách bằng dấu phẩy" />
        <TextField id="director" label="Đạo diễn" value={form.director} onChange={set("director")} error={errors.director} />
        <TextField id="cast" label="Diễn viên" value={form.cast} onChange={set("cast")} error={errors.cast} hint="Ngăn cách bằng dấu phẩy" />
        <TextField id="country" label="Quốc gia" value={form.country} onChange={set("country")} error={errors.country} />
        <TextField id="originalLanguage" label="Ngôn ngữ gốc" value={form.originalLanguage} onChange={set("originalLanguage")} error={errors.originalLanguage} />
        <TextField id="subtitleLanguages" label="Phụ đề" value={form.subtitleLanguages} onChange={set("subtitleLanguages")} error={errors.subtitleLanguages} hint="Ngăn cách bằng dấu phẩy" />
        <TextField id="dubbedLanguages" label="Lồng tiếng" value={form.dubbedLanguages} onChange={set("dubbedLanguages")} error={errors.dubbedLanguages} hint="Ngăn cách bằng dấu phẩy" />
        <Field id="status" label="Trạng thái hiển thị" required error={errors.status}>
          <Select value={form.status} onValueChange={set("status")}>
            <SelectTrigger id="status" aria-label="Trạng thái hiển thị">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MOVIE_DB_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {MOVIE_STATUS_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="description" label="Mô tả" error={errors.description} className="md:col-span-2">
          <textarea
            id="description"
            name="description"
            rows={5}
            value={form.description}
            onChange={(event) => set("description")(event.target.value)}
            aria-invalid={errors.description ? true : undefined}
            className="w-full border border-input bg-surface-input px-3 py-2 text-base text-foreground outline-hidden focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 aria-invalid:border-danger md:text-body"
          />
        </Field>
      </FormSection>

      <FormSection title="Tài nguyên media">
        <ImageUploadField id="posterUrl" label="Poster (ảnh 2:3)" bucket="posters" value={form.posterUrl} onChange={set("posterUrl")} error={errors.posterUrl} previewClassName="aspect-[2/3] w-28 border border-border-subtle object-cover" hint="JPG, PNG hoặc WebP, tối đa 5 MB" />
        <ImageUploadField id="bannerUrl" label="Banner (ảnh 16:9)" bucket="banners" value={form.bannerUrl} onChange={set("bannerUrl")} error={errors.bannerUrl} previewClassName="aspect-video w-48 border border-border-subtle object-cover" hint="JPG, PNG hoặc WebP, tối đa 5 MB" />
        <TextField id="trailerUrl" label="Trailer (URL YouTube)" type="url" value={form.trailerUrl} onChange={set("trailerUrl")} error={errors.trailerUrl} />
      </FormSection>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Đang lưu…" : movie ? "Lưu phim" : "Tạo phim"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.push("/admin/phim")}>
          Huỷ
        </Button>
      </div>
    </form>
  );
}
