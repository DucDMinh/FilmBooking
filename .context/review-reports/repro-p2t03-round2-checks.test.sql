-- Reviewer round 2 (bug-layer34-review phase-2-task-03): kiểm định nghĩa hàm trên DB local + chứng minh 054 phần 2 không tạo race.
begin;
select plan(9);

-- Định nghĩa trên DB khớp migration round 2
select ok((select prosrc from pg_proc where oid = 'public.confirm_pos_sale(uuid,text)'::regprocedure) like '%CINEMA_NOT_OPEN%',
  'DB: confirm_pos_sale có CINEMA_NOT_OPEN');
select ok((select prosrc from pg_proc where oid = 'public.confirm_pos_sale(uuid,text)'::regprocedure) like '%v_has_expired%',
  'DB: confirm_pos_sale có precheck mới (v_has_expired)');
select ok((select prosrc from pg_proc where oid = 'public.confirm_zero_amount(uuid)'::regprocedure) like '%khoá vận hành%',
  'DB: confirm_zero_amount có thông điệp F6');
select ok((select bool_and(prosecdef) from pg_proc where oid in ('public.confirm_pos_sale(uuid,text)'::regprocedure,
  'public.confirm_zero_amount(uuid)'::regprocedure)), 'SECURITY DEFINER cả hai');
select ok((select bool_and(proconfig @> array['search_path=""']) from pg_proc where oid in ('public.confirm_pos_sale(uuid,text)'::regprocedure,
  'public.confirm_zero_amount(uuid)'::regprocedure)), 'search_path rỗng cả hai');
select ok(not has_function_privilege('authenticated', 'public.confirm_pos_sale(uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.confirm_pos_sale(uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.confirm_pos_sale(uuid,text)', 'execute'), 'ACL POS: chỉ service_role');
select ok(has_function_privilege('authenticated', 'public.confirm_zero_amount(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.confirm_zero_amount(uuid)', 'execute'), 'ACL zero: authenticated, không anon');

-- Chứng minh 054 phần 2: phiên C chạy `select pg_sleep(0.3), hold_seats(...)` trong MỘT câu lệnh => now() của C cố định
-- tại đầu câu lệnh (trước pg_sleep). Hold hết hạn ở clock_timestamp()+0.25s vẫn còn hạn theo now() sau khi ngủ 0.3s,
-- nên hold_seats (dùng now()) luôn thấy ghế "HELD còn hạn" => SEAT_TAKEN, không bao giờ chiếm ghế: race không xảy ra.
create temp table t_clock as select clock_timestamp() + interval '0.25 seconds' as exp;
select pg_sleep(0.3);
select ok((select exp from t_clock) > now(), 'now() đứng yên trong transaction: hold +0.25s vẫn "còn hạn" sau 0.3s ngủ');
select ok((select exp from t_clock) < clock_timestamp(), 'theo đồng hồ thật hold đã hết hạn (chỉ clock_timestamp thấy)');

select * from finish();
rollback;
