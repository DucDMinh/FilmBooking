-- Reviewer round 3: định nghĩa hàm trên DB local khớp migration (F8 fix KEY SHARE, F9 precheck), ACL / security.
begin;
select plan(7);
select ok(pg_get_functiondef('public.confirm_zero_amount(uuid)'::regprocedure) ilike '%order by st.id%for key share%', 'zero: seats FOR KEY SHARE');
select ok(pg_get_functiondef('public.confirm_pos_sale(uuid,text)'::regprocedure) ilike '%order by st.id%for key share%', 'pos: seats FOR KEY SHARE');
select ok(pg_get_functiondef('public.confirm_pos_sale(uuid,text)'::regprocedure) ilike '%sss.id is null or (sss.state = ''HELD'' and sss.expires_at <= now())%', 'pos: F9 precheck');
select ok(not (pg_get_functiondef('public.confirm_paid(uuid,integer,text,bigint)'::regprocedure) ilike '%for key share%'), 'confirm_paid: CHƯA khoá seats KEY SHARE (bằng chứng F11)');
select ok((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc
            where oid in ('public.confirm_zero_amount(uuid)'::regprocedure, 'public.confirm_pos_sale(uuid,text)'::regprocedure)),
          'SECURITY DEFINER + search_path=""');
select ok(not has_function_privilege('anon', 'public.confirm_zero_amount(uuid)', 'execute')
          and has_function_privilege('authenticated', 'public.confirm_zero_amount(uuid)', 'execute'), 'zero ACL');
select ok(not has_function_privilege('authenticated', 'public.confirm_pos_sale(uuid,text)', 'execute')
          and not has_function_privilege('anon', 'public.confirm_pos_sale(uuid,text)', 'execute')
          and has_function_privilege('service_role', 'public.confirm_pos_sale(uuid,text)', 'execute'), 'pos ACL');
select * from finish();
rollback;
