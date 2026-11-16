import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL) : null;
// Chỉ https (xem src/lib/images.ts).
const supabaseHost = supabaseUrl?.protocol === "https:" ? supabaseUrl.hostname : null;

const nextConfig: NextConfig = {
  // @filmbooking/shared xuất .ts thô (không build) → Next phải transpile.
  transpilePackages: ["@filmbooking/shared"],
  poweredByHeader: false,
  // Host phải khớp IMAGE_HOSTS (src/lib/images.ts). Poster/banner: Unsplash (seed) + Supabase Storage (upload).
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      ...(supabaseHost ? [{ protocol: "https" as const, hostname: supabaseHost }] : []),
    ],
  },
};

export default nextConfig;
