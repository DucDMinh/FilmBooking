import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Chakra_Petch, JetBrains_Mono, Orbitron } from "next/font/google";
import { preconnect } from "react-dom";
import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

// Bốn họ font, mỗi họ một việc (design-tokens §2.1). Be Vietnam Pro / Chakra Petch là font tĩnh nên phải khai weight.
// Orbitron CHỈ có subset latin (không có glyph tiếng Việt): chỉ dùng cho wordmark và số/ASCII (T3), nên không nạp vietnamese.
// Chakra Petch (heading) và Be Vietnam Pro (nội dung) preload vì nằm trên LCP; Orbitron và JetBrains Mono nạp khi dùng tới.
const chakraPetch = Chakra_Petch({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["600", "700"],
  variable: "--font-chakra",
  display: "swap",
});

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-be-vietnam",
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["400", "500"],
  variable: "--font-jetbrains",
  display: "swap",
  preload: false,
});

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["700", "900"],
  variable: "--font-orbitron",
  display: "swap",
  preload: false,
});

const fontVariables = [
  chakraPetch.variable,
  beVietnamPro.variable,
  jetBrainsMono.variable,
  orbitron.variable,
].join(" ");

export const metadata: Metadata = {
  title: { default: "CINEMO - Đặt vé xem phim", template: "%s | CINEMO" },
  description: "Đặt vé xem phim trực tuyến tại các rạp CINEMO: chọn suất, chọn ghế, thanh toán nhanh.",
};

// Chỉ dark-cinema (D1): không có light mode, không class `.dark`, không nút đổi theme.
// themeColor là giá trị meta thuần (không đi qua CSS) nên phải ghi literal = token --color-bg (#070709).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
  themeColor: "#070709",
};

/** Origin nguồn tải cross-origin (API, Supabase Realtime/Storage, ảnh seed) → mở sẵn kết nối, giảm LCP. */
function crossOriginHints(): string[] {
  const candidates = [process.env.NEXT_PUBLIC_API_URL, process.env.NEXT_PUBLIC_SUPABASE_URL, "https://images.unsplash.com"];
  return candidates.flatMap((url) => {
    try {
      return url ? [new URL(url).origin] : [];
    } catch {
      return [];
    }
  });
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  for (const origin of crossOriginHints()) preconnect(origin);
  return (
    <html lang="vi" className={fontVariables}>
      <body className="min-h-dvh">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
