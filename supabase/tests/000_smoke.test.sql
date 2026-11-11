-- Smoke test pgTAP: migration extension đã apply sạch.
begin;
select plan(7);

select has_extension('pgcrypto', 'pgcrypto đã cài');
select has_extension('citext', 'citext đã cài');
select has_extension('btree_gist', 'btree_gist đã cài');
select has_extension('pg_cron', 'pg_cron đã cài');
select has_extension('pg_net', 'pg_net đã cài');
select has_extension('pgtap', 'pgtap đã cài');

-- Chức năng thật sự dùng được, không chỉ có tên trong catalog.
select is(
  'Abc@Example.com'::extensions.citext,
  'abc@example.com'::extensions.citext,
  'citext so sánh không phân biệt hoa thường'
);

select * from finish();
rollback;
