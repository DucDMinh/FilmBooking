import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = {
  title: "Đăng ký tài khoản | CINEMO",
  description: "Tạo tài khoản CINEMO để đặt vé xem phim trực tuyến và nhận ưu đãi.",
};

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function RegisterPage({ searchParams }: PageProps) {
  const { next } = await searchParams;
  return <RegisterForm next={next} />;
}
