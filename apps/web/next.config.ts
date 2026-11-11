import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @filmbooking/shared xuất .ts thô (không build) → Next phải transpile.
  transpilePackages: ["@filmbooking/shared"],
  poweredByHeader: false,
};

export default nextConfig;
