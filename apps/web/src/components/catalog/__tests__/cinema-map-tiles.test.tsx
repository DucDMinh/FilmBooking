import "@testing-library/jest-dom/vitest";

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CinemaMap } from "@/components/catalog/cinema-map";

const leafletMock = vi.hoisted(() => {
  const map = { remove: vi.fn() };
  const marker = { addTo: vi.fn(), bindPopup: vi.fn() };
  marker.addTo.mockReturnValue(marker);
  const tileLayerInstance = { addTo: vi.fn() };
  return {
    map,
    marker,
    tileLayerInstance,
    mapFactory: vi.fn(() => map),
    tileLayer: vi.fn(() => tileLayerInstance),
    divIcon: vi.fn(() => ({})),
    markerFactory: vi.fn(() => marker),
  };
});

vi.mock("leaflet", () => ({
  map: leafletMock.mapFactory,
  tileLayer: leafletMock.tileLayer,
  divIcon: leafletMock.divIcon,
  marker: leafletMock.markerFactory,
}));
vi.mock("leaflet/dist/leaflet.css", () => ({}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CinemaMap có toạ độ (tile layer)", () => {
  it("dùng tile OSM France, không dùng tile.openstreetmap.org (bị DNS chặn) hay CARTO (đóng dấu API KEY REQUIRED)", async () => {
    render(
      <CinemaMap
        latitude={21.0362}
        longitude={105.7831}
        cinemaName="CINEMO Cầu Giấy"
        address="1 Xuân Thủy, Cầu Giấy, Hà Nội"
      />,
    );

    await waitFor(() => expect(leafletMock.tileLayer).toHaveBeenCalledTimes(1));

    const [url, options] = leafletMock.tileLayer.mock.calls[0] as unknown as [
      string,
      { attribution: string; subdomains?: string; maxZoom?: number },
    ];
    expect(url).toContain("tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png");
    expect(url).not.toContain("tile.openstreetmap.org");
    expect(url).not.toContain("cartocdn");
    expect(options.subdomains).toBe("abc");
    expect(options.maxZoom).toBe(20);
    // Giấy phép dữ liệu yêu cầu ghi nguồn OSM contributors và nhà cung cấp tile
    expect(options.attribution).toContain("OpenStreetMap contributors");
    expect(options.attribution).toContain("OpenStreetMap France");
  });

  it("link chỉ đường trỏ Google Maps tới toạ độ rạp", async () => {
    const { findByRole } = render(
      <CinemaMap
        latitude={21.0362}
        longitude={105.7831}
        cinemaName="CINEMO Cầu Giấy"
        address="1 Xuân Thủy, Cầu Giấy, Hà Nội"
      />,
    );

    const link = await findByRole("link", { name: /Mở chỉ đường \(Google Maps\)/i });
    expect(link).toHaveAttribute(
      "href",
      "https://www.google.com/maps/dir/?api=1&destination=21.0362,105.7831",
    );
  });
});
