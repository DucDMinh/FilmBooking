import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

// Không truyền `weight` → nạp variable font đủ trục, dùng được weight lẻ 450/650/750/850.
const inter = Inter({
  subsets: ["latin", "vietnamese"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "CINEMO – Đặt vé xem phim", template: "%s | CINEMO" },
  description: "Đặt vé xem phim trực tuyến tại các rạp CINEMO: chọn suất, chọn ghế, thanh toán nhanh.",
};

// Chỉ dark-cinema (D1): không có light mode, không class `.dark`, không nút đổi theme.
// themeColor là giá trị meta thuần (không đi qua CSS) nên phải ghi literal = token --color-bg.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
  themeColor: "#0B0D12",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi" className={inter.variable}>
      <body className="min-h-dvh">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
