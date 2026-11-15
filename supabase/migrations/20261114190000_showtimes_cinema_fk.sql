-- ============================================================================
-- 20261114190000_showtimes_cinema_fk.sql
-- layer-8 task-08: Thêm FK showtimes(cinema_id) -> cinemas(id) để hỗ trợ PostgREST embed cinemas!inner
--
-- HIGH_RISK_MIGRATION:
--   - Bảng: public.showtimes
--   - Cột: cinema_id
--   - Thao tác: ADD CONSTRAINT showtimes_cinema_id_fkey FOREIGN KEY (cinema_id) REFERENCES public.cinemas(id) ON DELETE RESTRICT
--   - Lý do an toàn: Dữ liệu hiện có luôn hợp lệ vì FK ghép qua rooms:
--     foreign key (room_id, cinema_id) references public.rooms (id, cinema_id)
--     kết hợp rooms.cinema_id -> cinemas.id đã đảm bảo mọi cinema_id trong showtimes luôn thuộc về một cinema hợp lệ.
--   - Rollback: ALTER TABLE public.showtimes DROP CONSTRAINT IF EXISTS showtimes_cinema_id_fkey;
--   - Verify: pgTAP 062 (supabase/tests/062_showtimes_cinema_fk.test.sql)
-- ============================================================================

ALTER TABLE public.showtimes
  ADD CONSTRAINT showtimes_cinema_id_fkey
  FOREIGN KEY (cinema_id) REFERENCES public.cinemas(id) ON DELETE RESTRICT;

NOTIFY pgrst, 'reload schema';
