-- Reviewer (feature-remove-pos phase-2 task-01 round 1): đối chiếu định nghĩa trên DB local với file migration.
begin;
select plan(12);

select ok(pg_get_functiondef('public.confirm_zero_amount(uuid)'::regprocedure) ~* 'for share of s', 'zero: showtimes FOR SHARE');
select ok(pg_get_functiondef('public.confirm_zero_amount(uuid)'::regprocedure) !~* 'key share', 'zero: không còn KEY SHARE');
select ok(pg_get_functiondef('public.confirm_zero_amount(uuid)'::regprocedure) ~* 'sell_order_seats', 'zero: gọi sell_order_seats');
select ok(pg_get_functiondef('public.confirm_zero_amount(uuid)'::regprocedure) !~* 'current_setting\(''role''', 'zero: bỏ nhánh elsif');
select ok(pg_get_functiondef('public.confirm_zero_amount(uuid)'::regprocedure) ~* 'CINEMA_NOT_OPEN', 'zero: kiểm rạp OPEN');
select is((select count(*)::int from pg_constraint where conname = 'tickets_seat_id_fkey'), 0, 'không còn FK tickets_seat_id_fkey');
select is((select count(*)::int from pg_constraint c where c.conrelid = 'public.tickets'::regclass and c.contype = 'f'
            and c.confrelid = 'public.seats'::regclass), 0, 'tickets không có FK nào tới seats');
select ok(pg_get_functiondef('public.hold_seats(uuid,uuid[],text,uuid,text)'::regprocedure) ~* 'is distinct from ''WEB''', 'hold_seats: kiểm kênh WEB');
select ok(pg_get_functiondef('public.hold_seats(uuid,uuid[],text,uuid,text)'::regprocedure) !~* 'pos_requests', 'hold_seats: không pos_requests');
select is((select name from supabase_migrations.schema_migrations where version = '20261112120000'), 'zero_amount_sell_hardening', 'schema_migrations 120000 đúng tên');
select is((select name from supabase_migrations.schema_migrations where version = '20261112130000'), 'remove_pos', 'schema_migrations 130000 đúng tên');
select is((select p.prosecdef::text || '/' || array_to_string(p.proconfig, ',') from pg_proc p
            where p.oid = 'public.confirm_zero_amount(uuid)'::regprocedure), 'true/search_path=""', 'zero: SECURITY DEFINER + search_path rỗng');

select * from finish();
rollback;
