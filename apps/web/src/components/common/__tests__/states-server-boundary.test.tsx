import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { Film } from "lucide-react";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { EmptyState } from "../states";

afterEach(cleanup);

describe("states — dùng được từ server component", () => {
  // Server page truyền icon={Film} (function). Nếu module có "use client", Next serialize
  // props qua ranh giới client và trả 500 "Functions cannot be passed directly to Client Components".
  it("states.tsx không khai báo 'use client' (không hook/handler, an toàn cho server page)", () => {
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../states.tsx"), "utf8");
    expect(source).not.toMatch(/^\s*["']use client["']/m);
  });

  it("EmptyState render với icon là function component", () => {
    render(<EmptyState title="Chưa có phim" description="Sẽ có sớm." icon={Film} />);
    expect(screen.getByRole("heading", { name: "Chưa có phim" })).toBeInTheDocument();
    expect(document.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
