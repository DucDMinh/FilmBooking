const SAFE_LINK_PROTOCOLS = new Set(["https:", "http:"]);

function isSafeLink(url: string): boolean {
  try {
    return SAFE_LINK_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

function textDiv(text: string, cssText: string): HTMLDivElement {
  const el = document.createElement("div");
  el.textContent = text; // textContent: dữ liệu rạp do Manager nhập không bao giờ được parse thành HTML
  el.style.cssText = cssText;
  return el;
}

/**
 * Dựng popup bản đồ bằng DOM node (không ghép chuỗi HTML) để tên/địa chỉ rạp
 * do Manager nhập không thể chèn thẻ/handler (XSS - K6). Truyền thẳng cho Leaflet bindPopup.
 */
export function buildCinemaPopup(
  cinemaName: string,
  address: string,
  directionsUrl: string,
): HTMLElement {
  const root = document.createElement("div");
  root.style.cssText = "font-family: inherit; color: #151A24; padding: 4px 2px;";
  root.append(
    textDiv(cinemaName, "font-weight: 700; font-size: 14px; margin-bottom: 4px;"),
    textDiv(address, "font-size: 12px; color: #4A505C; margin-bottom: 8px;"),
  );

  if (isSafeLink(directionsUrl)) {
    const link = document.createElement("a");
    link.href = directionsUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Chỉ đường trên OpenStreetMap →";
    link.style.cssText =
      "display: inline-flex; align-items: center; font-size: 12px; font-weight: 600; color: #F06D5B; text-decoration: underline;";
    root.append(link);
  }
  return root;
}
