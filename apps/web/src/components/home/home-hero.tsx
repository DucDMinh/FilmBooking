import type { ReactNode } from "react";
import Link from "next/link";

import { RemoteImage } from "@/components/common/remote-image";
import { Button } from "@/components/ui/button";

import "./home-hero.css";

export interface HomeHeroMovie {
  slug: string;
  titleVi: string;
  bannerUrl: string;
  ageRating?: string;
  durationMinutes?: number;
}

export interface HomeHeroProps {
  /** Phim nổi bật; thiếu thì hero chỉ hiện lời chào chung để thanh đặt vé nhanh vẫn dùng được. */
  movie: HomeHeroMovie | null;
  /** Thanh Đặt vé nhanh (R-138) nằm ở đáy khối hero. */
  children: ReactNode;
}

/** Tách tên phim thành 2 dòng ở giữa dãy từ: dòng 2 được vẽ outline và tách sang phải khi cuộn. */
export function splitTitleInTwoLines(title: string): [string, string] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return [words[0] ?? "", ""];
  const cut = Math.ceil(words.length / 2);
  return [words.slice(0, cut).join(" "), words.slice(cut).join(" ")];
}

/**
 * Hero trang chủ (design-spec §16.4 "Hero ghim"): `.hs-scene > .hs-pin`. Trên desktop đủ cao, CSS ghim 90svh và
 * mọi chuyển động chạy theo vị trí cuộn (scroll-driven, không JS); mobile/màn thấp/reduced-motion để tĩnh.
 */
export function HomeHero({ movie, children }: Readonly<HomeHeroProps>) {
  const [firstLine, secondLine] = splitTitleInTwoLines(movie?.titleVi ?? "Đặt vé xem phim");
  return (
    <div className="hs-scene">
      <section className="hs-pin" aria-label="Phim nổi bật">
        <div className="hs-bg" aria-hidden={movie ? undefined : true}>
          {movie ? (
            <RemoteImage
              src={movie.bannerUrl}
              alt={`Banner phim ${movie.titleVi}`}
              sizes="(min-width: 1280px) 1280px, 100vw"
              priority
              className="size-full object-cover object-center"
            />
          ) : null}
          <div className="hs-bg__shade" />
        </div>
        <div className="grid-bg" aria-hidden="true" />
        <div className="hs-body">
          <p className="hud hud-brand hs-lead">{movie ? "Phim nổi bật" : "CINEMO"}</p>
          <h1 className="hs-title">
            <span className="hs-line hs-l1">{firstLine}</span>
            {secondLine ? " " : null}
            {secondLine ? <span className="hs-line hs-l2 hs-line--outline">{secondLine}</span> : null}
          </h1>
          {movie ? (
            <>
              <p className="hs-meta hs-lead">
                {movie.ageRating ? <span className="hs-chip">{movie.ageRating}</span> : null}
                {movie.durationMinutes ? <span>{movie.durationMinutes} phút</span> : null}
              </p>
              <div className="hs-cta hs-lead">
                <Button asChild size="lg">
                  <Link href={`/phim/${movie.slug}#lich-chieu`}>Đặt vé ngay</Link>
                </Button>
                <Button asChild variant="secondary" size="lg">
                  <Link href={`/phim/${movie.slug}`}>Xem chi tiết</Link>
                </Button>
              </div>
            </>
          ) : null}
        </div>
        <div className="hs-qbar-wrap">{children}</div>
      </section>
    </div>
  );
}
