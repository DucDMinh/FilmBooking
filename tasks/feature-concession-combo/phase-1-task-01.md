# Feature concession-combo · phase-1-task-01 — DB & Shared: Bảng `combos`, `order_combos`, tính tiền đơn & DTOs

- **Classification / Risk:** MODIFY (kích hoạt R-58, R-69, R-72). Risk: Thêm bảng mới, quan hệ với `orders`, tính toán `subtotal_amount` và `total_amount`. Migration additive, không phá vỡ dữ liệu cũ. Reviewer: **STRICT**.
- **Scope:** `supabase/migrations/20261123120000_concession_combo.sql`, `packages/shared/src/schemas/booking.ts`, `packages/shared/src/database.types.ts`, `supabase/tests/*`.

## Thiết kế chi tiết

### 1. Database Migration `supabase/migrations/20261123120000_concession_combo.sql`
- **Bảng `public.combos`**:
  - `id uuid primary key default gen_random_uuid()`
  - `name text not null check (length(trim(name)) > 0)`
  - `description text`
  - `price_amount integer not null check (price_amount >= 0)`
  - `image_url text`
  - `is_active boolean not null default true`
  - `display_order integer not null default 0`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
  - Bật RLS: `combos_select_public` cho phép anon/authenticated đọc khi `is_active = true`.
  - Trigger `set_updated_at` cho bảng `combos`.

- **Bảng `public.order_combos`**:
  - `id uuid primary key default gen_random_uuid()`
  - `order_id uuid not null references public.orders(id) on delete cascade`
  - `combo_id uuid not null references public.combos(id) on delete restrict`
  - `combo_name text not null`
  - `quantity integer not null check (quantity > 0)`
  - `unit_price integer not null check (unit_price >= 0)`
  - `total_price integer not null check (total_price = quantity * unit_price)`
  - `created_at timestamptz not null default now()`
  - `unique (order_id, combo_id)`
  - Bật RLS: Khớp với chính sách `orders_select` (chủ đơn hoặc staff/manager có cinema_scope hoặc admin).

- **Hàm `public.sync_order_combos(p_order_id uuid, p_items jsonb)`**:
  - Nhận `p_order_id` và mảng items `[{"combo_id": "...", "quantity": 1}]`.
  - Kiểm tra đơn hàng: phải tồn tại, đang ở trạng thái `holding`, và chưa hết hạn (`hold_expires_at > now()`).
  - Xoá các combo cũ của đơn và chèn các combo mới (chỉ chèn những item có `quantity > 0`).
  - Lấy `price_amount` và `name` trực tiếp từ bảng `combos` đang hoạt động (`is_active = true`).
  - Tính lại `subtotal_amount = sum(order_seats) + sum(order_combos)` và `total_amount = subtotal_amount - discount_amount`.
  - Cập nhật vào `orders`.

- **Seed demo data**:
  - 4 combo ban đầu với `display_order` 1..4:
    1. Combo Solo: "1 Bắp ngọt (vừa) + 1 Nước ngọt có ga 22oz", giá 69.000đ
    2. Combo Couple: "1 Bắp ngọt (lớn) + 2 Nước ngọt có ga 22oz", giá 99.000đ
    3. Bắp Phô Mai: "1 Bắp rang bơ lắc bột phô mai hảo hạng", giá 49.000đ
    4. Nước Ngọt 22oz: "Coca-Cola / Sprite / Fanta mát lạnh 22oz", giá 29.000đ

### 2. Packages/shared
- Thêm schemas trong `packages/shared/src/schemas/booking.ts`:
  - `ComboDto`: id, name, description, priceAmount, imageUrl, isActive, displayOrder
  - `OrderComboDto`: id, orderId, comboId, comboName, quantity, unitPrice, totalPrice
  - `updateOrderCombosSchema` & `UpdateOrderCombosInput`: `z.object({ items: z.array(z.object({ comboId: z.string().uuid(), quantity: z.number().int().min(0).max(20) })) })`
  - Mở rộng `BookingSummaryResponse`:
    - `combos: OrderComboDto[]`
    - `pricing.combosTotal: number`

### 3. Verification
- Chạy `pnpm -w typecheck` PASS.
- Test SQL hoặc script kiểm tra hàm `sync_order_combos` tính đúng tiền khi có vé + combo.
