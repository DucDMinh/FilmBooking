import Image from "next/image";

import { IMAGE_HOSTS } from "@/lib/images";

interface RemoteImageProps {
  src: string;
  alt: string;
  sizes: string;
  className?: string;
  /** true cho ảnh LCP (hero) → preload, không lazy. */
  priority?: boolean;
}

function isOptimizable(src: string): boolean {
  try {
    return IMAGE_HOSTS.includes(new URL(src).hostname);
  } catch {
    return false;
  }
}

/**
 * Ảnh phủ kín khung cha (cha phải `relative` + có kích thước). Host đã khai trong next.config → next/image
 * (WebP/AVIF, srcset); host lạ do admin nhập → <img> thường để không làm vỡ trang.
 */
export function RemoteImage({ src, alt, sizes, className, priority = false }: Readonly<RemoteImageProps>) {
  if (!isOptimizable(src)) {
    return <img src={src} alt={alt} loading={priority ? "eager" : "lazy"} className={className} />;
  }
  return <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className={className} />;
}
