-- Run against the designated development DB after applying the reviewed migration.
-- Entire suite rolls back; does not call Gemini, Trigger or Storage APIs.
begin;
create function pg_temp.check_studio(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; end;
$$;
create function pg_temp.expect_studio_error(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm = expected then return; end if;
    raise exception 'Expected %, got %', expected, sqlerrm;
  end;
  raise exception 'Expected exception: %', expected;
end;
$$;

select pg_temp.check_studio(not has_table_privilege('authenticated','public.generation_jobs','INSERT'), 'authenticated cannot insert jobs');
select pg_temp.check_studio(not has_table_privilege('authenticated','public.assets','UPDATE'), 'authenticated cannot update assets');
select pg_temp.check_studio(not has_table_privilege('authenticated','public.generation_usage','DELETE'), 'authenticated cannot refund usage');
select pg_temp.check_studio(not has_schema_privilege('authenticated','studio_private','USAGE'), 'quota schema private');
select pg_temp.check_studio(not has_function_privilege('authenticated','public.studio_reserve_job(uuid,uuid,text,text,text,text,uuid,text)','EXECUTE'), 'authenticated cannot reserve directly');
select pg_temp.check_studio(not has_function_privilege('anon','public.studio_get_quota()','EXECUTE'), 'anon cannot inspect quota');
select pg_temp.check_studio(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'studio_%' and p.prosecdef), 'all public RPCs security invoker');
select pg_temp.check_studio((select count(*) = 10 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'studio_%' and not has_function_privilege('authenticated',p.oid,'EXECUTE')), 'all 10 RPCs deny authenticated');

set local role service_role;
do $$
declare
  owner_a uuid := '10000000-0000-4000-8000-000000000001';
  owner_b uuid := '10000000-0000-4000-8000-000000000002';
  request_a uuid := '20000000-0000-4000-8000-000000000001';
  job_a uuid; job_b uuid; asset_ref uuid;
  response jsonb; first_response jsonb;
  meta jsonb := jsonb_build_object('sha256',repeat('a',64),'bytes',100,'width',10,'height',10,'mediaType','image/png','providerModel','test-model');
  reference_meta jsonb := jsonb_build_object('sha256',repeat('b',64),'bytes',100,'width',10,'height',10,'mediaType','image/png','providerModel',null);
  previous_consumed integer; old_offset integer;
begin
  select consumed, legacy_offset into previous_consumed,old_offset from studio_private.studio_quota where singleton;
  update studio_private.studio_quota set enabled=false where singleton;
  perform pg_temp.expect_studio_error(format('select public.studio_reserve_job(%L,%L,%L,%L,%L,%L,null,%L)',owner_a,request_a,'gemini-3.1-flash-image','test','1:1','512',repeat('c',64)), 'STUDIO_DISABLED');
  update studio_private.studio_quota set enabled=true, global_limit=1000, user_limit=100, network_limit=100, active_limit=100, per_minute_limit=100, minimum_gap_seconds=0 where singleton;

  response := public.studio_reserve_job(owner_a,request_a,'gemini-3.1-flash-image','test','1:1','512',null,repeat('c',64));
  job_a := (response->'job'->>'id')::uuid;
  perform pg_temp.check_studio((response->>'created')::boolean, 'first reservation created');
  -- Disable after reservation: the exact retry still returns its existing owned job.
  update studio_private.studio_quota set enabled=false where singleton;
  response := public.studio_reserve_job(owner_a,request_a,'gemini-3.1-flash-image','test','1:1','512',null,repeat('d',64));
  perform pg_temp.check_studio(not (response->>'created')::boolean and (response->'job'->>'id')::uuid=job_a, 'same request does not repeat reservation');
  perform pg_temp.check_studio((select consumed=previous_consumed+1 and legacy_offset=old_offset from studio_private.studio_quota), 'single consumed increment and unchanged legacy offset');
  perform pg_temp.expect_studio_error(format('select public.studio_reserve_job(%L,%L,%L,%L,%L,%L,null,%L)',owner_a,request_a,'gemini-3.1-flash-image','changed','1:1','512',repeat('c',64)), 'STUDIO_REQUEST_CONFLICT');
  update studio_private.studio_quota set enabled=true where singleton;
  perform pg_temp.expect_studio_error(format('select public.studio_reserve_job(%L,gen_random_uuid(),%L,%L,%L,%L,null,%L)',owner_a,'gemini-3-pro-image','test','1:1','512',repeat('c',64)), 'STUDIO_INVALID_INPUT');
  perform pg_temp.check_studio(not studio_private.valid_image_metadata(meta || '{"bytes":-1}'::jsonb) and not studio_private.valid_image_metadata(meta || '{"extra":true}'::jsonb), 'strict output metadata');

  response := public.studio_claim_job(job_a,'test-run-a');
  perform pg_temp.check_studio((response->>'claimed')::boolean, 'initial claim');
  response := public.studio_claim_job(job_a,'test-run-a');
  perform pg_temp.check_studio(not (response->>'claimed')::boolean, 'duplicate same-run claim fenced');
  response := public.studio_claim_job(job_a,'test-run-b');
  perform pg_temp.check_studio(not (response->>'claimed')::boolean, 'different-run replay fenced');
  perform pg_temp.expect_studio_error(format('select public.studio_link_run(%L,%L,%L)',job_a,'test-run-b','sent'), 'STUDIO_STATE_CONFLICT');
  perform pg_temp.expect_studio_error(format('select public.studio_fail_job(%L,null,%L,%L,false)',job_a,'DISPATCH_FAILED','test failure'), 'STUDIO_STATE_CONFLICT');
  perform pg_temp.check_studio(not public.studio_begin_provider(job_a,'test-run-b'), 'different run cannot dispatch');
  perform pg_temp.check_studio(public.studio_begin_provider(job_a,'test-run-a'), 'first provider dispatch');
  perform pg_temp.check_studio(not public.studio_begin_provider(job_a,'test-run-a'), 'paid replay fenced');
  perform pg_temp.check_studio((select status='attempted' from public.generation_usage where job_id=job_a), 'dispatch records attempted');
  perform pg_temp.expect_studio_error(format('select public.studio_complete_job(%L,%L,%L::jsonb)',job_a,'test-run-a',meta::text), 'STUDIO_STATE_CONFLICT');
  perform public.studio_save_output_metadata(job_a,'test-run-a',meta);
  perform pg_temp.expect_studio_error(format('select public.studio_save_output_metadata(%L,%L,%L::jsonb)',job_a,'test-run-a',(meta || '{"width":11}'::jsonb)::text), 'STUDIO_STATE_CONFLICT');
  perform public.studio_fail_job(job_a,'test-run-a','SAVE_UNCERTAIN','test save uncertainty',true);
  perform pg_temp.check_studio((select status='uncertain' from public.generation_usage where job_id=job_a), 'unknown output remains consumed');
  first_response := public.studio_complete_job(job_a,'test-run-a',meta);
  response := public.studio_complete_job(job_a,'test-run-a',meta);
  perform pg_temp.check_studio(response=first_response and (response->>'id')::uuid=job_a and response->>'storage_path'=owner_a::text || '/generated/' || job_a::text || '/image', 'idempotent finalize with deterministic object path');
  perform pg_temp.check_studio(not public.studio_fail_job(job_a,'test-run-a','LATE_FAILURE','late callback',true), 'late failure cannot replace success');
  perform pg_temp.check_studio((select status='succeeded' from public.generation_usage where job_id=job_a), 'finalization updates accounting');

  first_response := public.studio_reserve_reference(owner_a,gen_random_uuid(),'reference.png',reference_meta,repeat('c',64));
  asset_ref := (first_response->>'id')::uuid;
  perform pg_temp.check_studio(not (first_response->>'ready')::boolean, 'reference reservation pending');
  response := public.studio_reserve_reference(owner_a,(first_response->>'reference_request_id')::uuid,'reference.png',reference_meta,repeat('c',64));
  perform pg_temp.check_studio(response=first_response, 'reference retry returns same pending asset');
  perform pg_temp.expect_studio_error(format('select public.studio_reserve_job(%L,gen_random_uuid(),%L,%L,%L,%L,%L,%L)',owner_a,'gemini-3.1-flash-image','test','1:1','512',asset_ref,repeat('c',64)), 'STUDIO_INVALID_REFERENCE');
  perform public.studio_complete_reference(asset_ref,owner_a);
  perform pg_temp.expect_studio_error(format('select public.studio_reserve_job(%L,gen_random_uuid(),%L,%L,%L,%L,%L,%L)',owner_b,'gemini-3.1-flash-image','test','1:1','512',asset_ref,repeat('e',64)), 'STUDIO_INVALID_REFERENCE');
  for i in 1..9 loop perform public.studio_reserve_reference(owner_a,gen_random_uuid(),'reference.png',reference_meta,repeat('c',64)); end loop;
  perform pg_temp.expect_studio_error(format('select public.studio_reserve_reference(%L,gen_random_uuid(),%L,%L::jsonb,%L)',owner_a,'reference.png',reference_meta::text,repeat('c',64)), 'STUDIO_REFERENCE_LIMIT');

  update studio_private.studio_quota set user_limit=1 where singleton;
  perform pg_temp.expect_studio_error(format('select public.studio_reserve_job(%L,gen_random_uuid(),%L,%L,%L,%L,null,%L)',owner_a,'gemini-3.1-flash-image','test','1:1','512',repeat('c',64)), 'STUDIO_USER_LIMIT');
  update studio_private.studio_quota set user_limit=100,network_limit=1 where singleton;
  perform pg_temp.expect_studio_error(format('select public.studio_reserve_job(%L,gen_random_uuid(),%L,%L,%L,%L,null,%L)',owner_b,'gemini-3.1-flash-image','test','1:1','512',repeat('c',64)), 'STUDIO_NETWORK_LIMIT');
  update studio_private.studio_quota set network_limit=100,minimum_gap_seconds=10,last_reserved_at=clock_timestamp() where singleton;
  perform pg_temp.expect_studio_error(format('select public.studio_reserve_job(%L,gen_random_uuid(),%L,%L,%L,%L,null,%L)',owner_b,'gemini-3.1-flash-image','test','1:1','512',repeat('e',64)), 'STUDIO_RATE_LIMIT');
  update studio_private.studio_quota set minimum_gap_seconds=0,global_limit=consumed+legacy_offset where singleton;
  perform pg_temp.expect_studio_error(format('select public.studio_reserve_job(%L,gen_random_uuid(),%L,%L,%L,%L,null,%L)',owner_b,'gemini-3.1-flash-image','test','1:1','512',repeat('e',64)), 'STUDIO_GLOBAL_LIMIT');
  update studio_private.studio_quota set global_limit=1000 where singleton;
  update studio_private.studio_quota set per_minute_limit=1 where singleton;
  perform pg_temp.expect_studio_error(format('select public.studio_reserve_job(%L,gen_random_uuid(),%L,%L,%L,%L,null,%L)',owner_b,'gemini-3.1-flash-image','test','1:1','512',repeat('e',64)), 'STUDIO_RATE_LIMIT');
  update studio_private.studio_quota set per_minute_limit=100,active_limit=1 where singleton;
  response := public.studio_reserve_job(owner_b,gen_random_uuid(),'gemini-3.1-flash-image','test','1:1','512',null,repeat('e',64));
  job_b := (response->'job'->>'id')::uuid;
  perform pg_temp.expect_studio_error(format('select public.studio_reserve_job(%L,gen_random_uuid(),%L,%L,%L,%L,null,%L)',owner_b,'gemini-3.1-flash-image','test','1:1','512',repeat('e',64)), 'STUDIO_BUSY');
  perform public.studio_fail_job(job_b,null,'DISPATCH_FAILED','never dispatched',false);
  perform pg_temp.check_studio((select status='failed' from public.generation_usage where job_id=job_b), 'pre-dispatch failure consumes reservation');
  perform pg_temp.check_studio((select consumed=previous_consumed+2 from studio_private.studio_quota), 'failed reservation never refunded');
end;
$$;

reset role;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.check_studio((select count(*)=1 from public.generation_jobs), 'RLS owner sees own job only');
select pg_temp.check_studio((select count(*)=2 from public.assets), 'RLS hides pending refs and another owner');
select pg_temp.check_studio((select count(*)=1 from public.generation_usage), 'RLS owner sees own accounting only');
reset role;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.check_studio((select count(*)=1 from public.generation_jobs), 'second owner sees only own job');
select pg_temp.check_studio((select count(*)=0 from public.assets), 'second owner sees no first-owner assets');
reset role;
rollback;
