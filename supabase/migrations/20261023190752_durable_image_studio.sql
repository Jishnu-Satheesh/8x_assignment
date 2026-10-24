-- Phase 2.1: durable, user-owned Image Studio. Additive staging migration.
-- No provider calls, Storage object writes or generation enablement occur here.
create schema if not exists studio_private;
revoke all on schema studio_private from public, anon, authenticated;
grant usage on schema studio_private to service_role;

create function studio_private.valid_image_metadata(p_metadata jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
begin
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then return false; end if;
  if not (p_metadata ?& array['sha256','bytes','width','height','mediaType','providerModel'])
    or exists (select 1 from jsonb_object_keys(p_metadata) k where k not in ('sha256','bytes','width','height','mediaType','providerModel')) then return false; end if;
  if jsonb_typeof(p_metadata->'sha256') <> 'string' or (p_metadata->>'sha256') !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_metadata->'mediaType') <> 'string' or (p_metadata->>'mediaType') not in ('image/png','image/jpeg','image/webp')
    or jsonb_typeof(p_metadata->'bytes') <> 'number' or (p_metadata->>'bytes') !~ '^[0-9]{1,9}$'
    or jsonb_typeof(p_metadata->'width') <> 'number' or (p_metadata->>'width') !~ '^[0-9]{1,5}$'
    or jsonb_typeof(p_metadata->'height') <> 'number' or (p_metadata->>'height') !~ '^[0-9]{1,5}$'
    or jsonb_typeof(p_metadata->'providerModel') not in ('string','null') then return false; end if;
  return (p_metadata->>'bytes')::integer between 1 and 16777216
    and (p_metadata->>'width')::integer between 1 and 16384
    and (p_metadata->>'height')::integer between 1 and 16384
    and (p_metadata->>'providerModel' is null or length(p_metadata->>'providerModel') between 1 and 200);
end;
$$;
revoke all on function studio_private.valid_image_metadata(jsonb) from public, anon, authenticated;
grant execute on function studio_private.valid_image_metadata(jsonb) to service_role;

create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  -- Owners intentionally survive Auth-user deletion: consumed budgets never reset.
  user_id uuid not null,
  request_id uuid not null,
  model text not null check (model in ('gemini-3.1-flash-image','gemini-3-pro-image')),
  prompt text not null check (length(prompt) between 1 and 4000 and prompt = btrim(prompt)),
  aspect_ratio text not null check (aspect_ratio in ('1:1','4:5','3:2','16:9','9:16')),
  resolution text not null check (resolution in ('512','1K','2K','4K') and (resolution <> '512' or model = 'gemini-3.1-flash-image')),
  reference_asset_id uuid,
  status text not null default 'queued' check (status in ('queued','preparing','generating','saving','completed','failed')),
  dispatch_status text not null default 'pending' check (dispatch_status in ('pending','sent','uncertain')),
  trigger_run_id text unique check (length(trigger_run_id) between 1 and 200),
  execution_run_id text check (length(execution_run_id) between 1 and 200),
  provider_dispatched_at timestamptz,
  output_metadata jsonb check (output_metadata is null or studio_private.valid_image_metadata(output_metadata)),
  asset_id uuid,
  error_code text check (length(error_code) between 1 and 80),
  error_message text check (length(error_message) between 1 and 500),
  uncertain boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, request_id), unique (id, user_id),
  check (trigger_run_id is null or execution_run_id is null or trigger_run_id = execution_run_id),
  check (provider_dispatched_at is null or execution_run_id is not null),
  check (status <> 'completed' or (asset_id is not null and output_metadata is not null)),
  check (asset_id is null or asset_id = id)
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null check (kind in ('generated','reference')),
  ready boolean not null default false,
  generation_job_id uuid unique,
  reference_request_id uuid,
  storage_path text not null unique,
  filename text not null check (length(filename) between 1 and 160 and filename !~ '[[:cntrl:]/\\]'),
  prompt text check (length(prompt) between 1 and 4000),
  model text check (model in ('gemini-3.1-flash-image','gemini-3-pro-image')),
  aspect_ratio text check (aspect_ratio in ('1:1','4:5','3:2','16:9','9:16')),
  resolution text check (resolution in ('512','1K','2K','4K') and (resolution <> '512' or model = 'gemini-3.1-flash-image')),
  reference_asset_id uuid,
  provider_model text check (length(provider_model) between 1 and 200),
  media_type text not null check (media_type in ('image/png','image/jpeg','image/webp')),
  width integer not null check (width between 1 and 16384),
  height integer not null check (height between 1 and 16384),
  byte_size integer not null check (byte_size between 1 and 16777216),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (id, user_id), unique (user_id, reference_request_id),
  foreign key (generation_job_id,user_id) references public.generation_jobs(id,user_id),
  foreign key (reference_asset_id,user_id) references public.assets(id,user_id),
  check ((kind = 'generated' and id = generation_job_id and prompt is not null and model is not null and aspect_ratio is not null and resolution is not null and reference_request_id is null and storage_path = user_id::text || '/generated/' || id::text || '/image')
    or (kind = 'reference' and generation_job_id is null and reference_request_id is not null and prompt is null and model is null and aspect_ratio is null and resolution is null and reference_asset_id is null and provider_model is null and byte_size <= 5242880 and storage_path = user_id::text || '/references/' || id::text || '/image'))
);
alter table public.generation_jobs add constraint generation_jobs_reference_owner_fk foreign key (reference_asset_id,user_id) references public.assets(id,user_id);
alter table public.generation_jobs add constraint generation_jobs_output_owner_fk foreign key (asset_id,user_id) references public.assets(id,user_id);

create table public.generation_usage (
  -- No Auth FK or cascading deletion: these rows and the global counter are lifetime accounting.
  job_id uuid primary key references public.generation_jobs(id),
  user_id uuid not null,
  request_id uuid not null,
  abuse_key text not null check (abuse_key ~ '^[a-f0-9]{64}$'),
  status text not null default 'reserved' check (status in ('reserved','attempted','succeeded','failed','uncertain')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, request_id),
  foreign key (job_id,user_id) references public.generation_jobs(id,user_id)
);

create table studio_private.studio_quota (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  consumed integer not null default 0 check (consumed >= 0),
  legacy_offset integer not null default 9 check (legacy_offset >= 0),
  global_limit integer not null default 20 check (global_limit > 0),
  user_limit integer not null default 3 check (user_limit > 0),
  network_limit integer not null default 3 check (network_limit > 0),
  active_limit integer not null default 2 check (active_limit > 0),
  per_minute_limit integer not null default 3 check (per_minute_limit > 0),
  minimum_gap_seconds integer not null default 10 check (minimum_gap_seconds >= 0),
  last_reserved_at timestamptz
);
insert into studio_private.studio_quota (singleton) values (true);

create index generation_jobs_owner_created_idx on public.generation_jobs(user_id,created_at desc);
create index generation_jobs_active_idx on public.generation_jobs(status) where status not in ('completed','failed');
create index generation_jobs_reference_idx on public.generation_jobs(reference_asset_id,user_id) where reference_asset_id is not null;
create index assets_owner_created_idx on public.assets(user_id,created_at desc);
create index assets_reference_idx on public.assets(reference_asset_id,user_id) where reference_asset_id is not null;
create index generation_usage_abuse_idx on public.generation_usage(abuse_key);
create index generation_usage_created_idx on public.generation_usage(created_at);

alter table public.generation_jobs enable row level security;
alter table public.assets enable row level security;
alter table public.generation_usage enable row level security;
alter table studio_private.studio_quota enable row level security;
revoke all on public.generation_jobs, public.assets, public.generation_usage from public, anon, authenticated;
grant select on public.generation_jobs, public.assets, public.generation_usage to authenticated;
grant all on public.generation_jobs, public.assets, public.generation_usage, studio_private.studio_quota to service_role;
create policy studio_jobs_owner_read on public.generation_jobs for select to authenticated using ((select auth.uid()) = user_id);
create policy studio_assets_owner_read on public.assets for select to authenticated using ((select auth.uid()) = user_id and ready);
create policy studio_usage_owner_read on public.generation_usage for select to authenticated using ((select auth.uid()) = user_id);

create function public.studio_reserve_job(p_owner_id uuid, p_request_id uuid, p_model text, p_prompt text, p_aspect_ratio text, p_resolution text, p_reference_asset_id uuid, p_abuse_key text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare q studio_private.studio_quota; j public.generation_jobs; v_now timestamptz := clock_timestamp();
begin
  -- Every reservation (including references and duplicates) takes this same lock first.
  select * into strict q from studio_private.studio_quota where singleton for update;
  select * into j from public.generation_jobs where user_id = p_owner_id and request_id = p_request_id;
  if found then
    if j.model is distinct from p_model or j.prompt is distinct from p_prompt or j.aspect_ratio is distinct from p_aspect_ratio or j.resolution is distinct from p_resolution or j.reference_asset_id is distinct from p_reference_asset_id then raise exception 'STUDIO_REQUEST_CONFLICT'; end if;
    return jsonb_build_object('job',to_jsonb(j),'created',false);
  end if;
  if p_owner_id is null or p_request_id is null or p_model is null or p_model not in ('gemini-3.1-flash-image','gemini-3-pro-image') or p_prompt is null or length(p_prompt) not between 1 and 4000 or p_prompt <> btrim(p_prompt)
    or p_aspect_ratio is null or p_aspect_ratio not in ('1:1','4:5','3:2','16:9','9:16') or p_resolution is null or p_resolution not in ('512','1K','2K','4K') or (p_resolution = '512' and p_model <> 'gemini-3.1-flash-image') or p_abuse_key is null or p_abuse_key !~ '^[a-f0-9]{64}$' then raise exception 'STUDIO_INVALID_INPUT'; end if;
  if not q.enabled then raise exception 'STUDIO_DISABLED'; end if;
  if p_reference_asset_id is not null and not exists (select 1 from public.assets where id = p_reference_asset_id and user_id = p_owner_id and ready) then raise exception 'STUDIO_INVALID_REFERENCE'; end if;
  if q.consumed + q.legacy_offset >= q.global_limit then raise exception 'STUDIO_GLOBAL_LIMIT'; end if;
  if (select count(*) from public.generation_usage where user_id = p_owner_id) >= q.user_limit then raise exception 'STUDIO_USER_LIMIT'; end if;
  if (select count(*) from public.generation_usage where abuse_key = p_abuse_key) >= q.network_limit then raise exception 'STUDIO_NETWORK_LIMIT'; end if;
  if (select count(*) from public.generation_jobs where status not in ('completed','failed')) >= q.active_limit then raise exception 'STUDIO_BUSY'; end if;
  if (q.last_reserved_at is not null and v_now < q.last_reserved_at + make_interval(secs => q.minimum_gap_seconds)) or (select count(*) from public.generation_usage where created_at > v_now - interval '1 minute') >= q.per_minute_limit then raise exception 'STUDIO_RATE_LIMIT'; end if;
  insert into public.generation_jobs(user_id,request_id,model,prompt,aspect_ratio,resolution,reference_asset_id) values (p_owner_id,p_request_id,p_model,p_prompt,p_aspect_ratio,p_resolution,p_reference_asset_id) returning * into j;
  insert into public.generation_usage(job_id,user_id,request_id,abuse_key) values (j.id,p_owner_id,p_request_id,p_abuse_key);
  update studio_private.studio_quota set consumed = consumed + 1, last_reserved_at = v_now where singleton;
  return jsonb_build_object('job',to_jsonb(j),'created',true);
end;
$$;

create function public.studio_link_run(p_job_id uuid, p_run_id text, p_state text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare j public.generation_jobs;
begin
  if p_state is null or p_state not in ('pending','sent','uncertain') or (p_run_id is not null and length(p_run_id) not between 1 and 200) or (p_state = 'sent' and p_run_id is null) then raise exception 'STUDIO_INVALID_INPUT'; end if;
  select * into j from public.generation_jobs where id = p_job_id for update;
  if not found then raise exception 'STUDIO_JOB_NOT_FOUND'; end if;
  if (j.trigger_run_id is not null and p_run_id is distinct from j.trigger_run_id) or (j.execution_run_id is not null and p_run_id is not null and p_run_id <> j.execution_run_id) then raise exception 'STUDIO_STATE_CONFLICT'; end if;
  if j.status in ('completed','failed') then return false; end if;
  -- Delayed dispatch errors cannot downgrade a run already claimed or acknowledged.
  update public.generation_jobs set trigger_run_id = coalesce(trigger_run_id,p_run_id),
    dispatch_status = case when execution_run_id is not null or dispatch_status = 'sent' then 'sent' else p_state end,
    updated_at = clock_timestamp() where id = p_job_id;
  return true;
end;
$$;

create function public.studio_claim_job(p_job_id uuid, p_run_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare j public.generation_jobs;
begin
  if p_run_id is null or length(p_run_id) not between 1 and 200 then raise exception 'STUDIO_INVALID_INPUT'; end if;
  select * into j from public.generation_jobs where id = p_job_id for update;
  if not found then raise exception 'STUDIO_JOB_NOT_FOUND'; end if;
  if j.status <> 'queued' or j.execution_run_id is not null or j.provider_dispatched_at is not null or (j.trigger_run_id is not null and j.trigger_run_id <> p_run_id) then return jsonb_build_object('job',to_jsonb(j),'claimed',false); end if;
  update public.generation_jobs set execution_run_id = p_run_id, trigger_run_id = p_run_id, dispatch_status = 'sent', status = 'preparing', updated_at = clock_timestamp() where id = p_job_id returning * into j;
  return jsonb_build_object('job',to_jsonb(j),'claimed',true);
end;
$$;

create function public.studio_begin_provider(p_job_id uuid, p_run_id text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare j public.generation_jobs;
begin
  select * into j from public.generation_jobs where id = p_job_id for update;
  if not found then raise exception 'STUDIO_JOB_NOT_FOUND'; end if;
  if p_run_id is null or j.execution_run_id is distinct from p_run_id or j.status <> 'preparing' or j.provider_dispatched_at is not null then return false; end if;
  update public.generation_jobs set provider_dispatched_at = clock_timestamp(), status = 'generating', updated_at = clock_timestamp() where id = p_job_id;
  update public.generation_usage set status = 'attempted', updated_at = clock_timestamp() where job_id = p_job_id and status = 'reserved';
  if not found then raise exception 'STUDIO_STATE_CONFLICT'; end if;
  return true;
end;
$$;

create function public.studio_save_output_metadata(p_job_id uuid, p_run_id text, p_metadata jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare j public.generation_jobs;
begin
  if not studio_private.valid_image_metadata(p_metadata) then raise exception 'STUDIO_INVALID_INPUT'; end if;
  select * into j from public.generation_jobs where id = p_job_id for update;
  if not found then raise exception 'STUDIO_JOB_NOT_FOUND'; end if;
  if p_run_id is null or j.execution_run_id is distinct from p_run_id or j.provider_dispatched_at is null or j.status not in ('generating','saving') or (j.output_metadata is not null and j.output_metadata is distinct from p_metadata) then raise exception 'STUDIO_STATE_CONFLICT'; end if;
  update public.generation_jobs set output_metadata = p_metadata, status = 'saving', updated_at = clock_timestamp() where id = p_job_id;
  return true;
end;
$$;

create function public.studio_complete_job(p_job_id uuid, p_run_id text, p_metadata jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare j public.generation_jobs; a public.assets;
begin
  if not studio_private.valid_image_metadata(p_metadata) then raise exception 'STUDIO_INVALID_INPUT'; end if;
  select * into j from public.generation_jobs where id = p_job_id for update;
  if not found then raise exception 'STUDIO_JOB_NOT_FOUND'; end if;
  if p_run_id is null or j.execution_run_id is distinct from p_run_id or j.provider_dispatched_at is null or j.output_metadata is distinct from p_metadata then raise exception 'STUDIO_STATE_CONFLICT'; end if;
  if j.status = 'completed' then select * into strict a from public.assets where id = j.asset_id; return to_jsonb(a); end if;
  -- A verified stored object may be finalized after an uncertain save failure, with no provider replay.
  if j.status <> 'saving' and not (j.status = 'failed' and j.uncertain) then raise exception 'STUDIO_STATE_CONFLICT'; end if;
  insert into public.assets(id,user_id,kind,ready,generation_job_id,storage_path,filename,prompt,model,aspect_ratio,resolution,reference_asset_id,provider_model,media_type,width,height,byte_size,sha256)
    values (j.id,j.user_id,'generated',true,j.id,j.user_id::text || '/generated/' || j.id::text || '/image',
      'studio-' || j.id::text || case p_metadata->>'mediaType' when 'image/png' then '.png' when 'image/jpeg' then '.jpg' else '.webp' end,
      j.prompt,j.model,j.aspect_ratio,j.resolution,j.reference_asset_id,p_metadata->>'providerModel',p_metadata->>'mediaType',(p_metadata->>'width')::integer,(p_metadata->>'height')::integer,(p_metadata->>'bytes')::integer,p_metadata->>'sha256') returning * into a;
  update public.generation_jobs set status = 'completed', asset_id = a.id, uncertain = false, error_code = null, error_message = null, updated_at = clock_timestamp() where id = p_job_id;
  update public.generation_usage set status = 'succeeded', updated_at = clock_timestamp() where job_id = p_job_id and status in ('attempted','uncertain');
  if not found then raise exception 'STUDIO_STATE_CONFLICT'; end if;
  return to_jsonb(a);
end;
$$;

create function public.studio_fail_job(p_job_id uuid, p_run_id text, p_error_code text, p_error_message text, p_uncertain boolean)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare j public.generation_jobs; is_uncertain boolean;
begin
  if p_error_code is null or length(p_error_code) not between 1 and 80 or p_error_message is null or length(p_error_message) not between 1 and 500 or p_uncertain is null then raise exception 'STUDIO_INVALID_INPUT'; end if;
  select * into j from public.generation_jobs where id = p_job_id for update;
  if not found then raise exception 'STUDIO_JOB_NOT_FOUND'; end if;
  if j.status in ('completed','failed') then return false; end if;
  -- A dispatcher without a claim may fail only a never-claimed job. A worker owns its claim.
  if (j.execution_run_id is not null and j.execution_run_id is distinct from p_run_id) or (j.execution_run_id is null and p_run_id is not null and j.trigger_run_id is distinct from p_run_id) then raise exception 'STUDIO_STATE_CONFLICT'; end if;
  is_uncertain := p_uncertain or j.provider_dispatched_at is not null;
  update public.generation_jobs set status = 'failed', uncertain = is_uncertain, error_code = p_error_code, error_message = p_error_message, updated_at = clock_timestamp() where id = p_job_id;
  update public.generation_usage set status = case when is_uncertain then 'uncertain' else 'failed' end, updated_at = clock_timestamp() where job_id = p_job_id;
  return true;
end;
$$;

create function public.studio_reserve_reference(p_owner_id uuid, p_request_id uuid, p_filename text, p_metadata jsonb, p_abuse_key text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare a public.assets; asset_id uuid := gen_random_uuid();
begin
  perform 1 from studio_private.studio_quota where singleton for update;
  if not found then raise exception 'STUDIO_STATE_CONFLICT'; end if;
  if p_owner_id is null or p_request_id is null or p_filename is null or length(p_filename) not between 1 and 160 or p_filename ~ '[[:cntrl:]/\\]' or not studio_private.valid_image_metadata(p_metadata) or p_abuse_key is null or p_abuse_key !~ '^[a-f0-9]{64}$' then raise exception 'STUDIO_INVALID_INPUT'; end if;
  if (p_metadata->>'bytes')::integer > 5242880 or p_metadata->>'providerModel' is not null then raise exception 'STUDIO_INVALID_REFERENCE'; end if;
  select * into a from public.assets where user_id = p_owner_id and reference_request_id = p_request_id;
  if found then
    if a.filename is distinct from p_filename or a.sha256 is distinct from p_metadata->>'sha256' or a.byte_size is distinct from (p_metadata->>'bytes')::integer or a.width is distinct from (p_metadata->>'width')::integer or a.height is distinct from (p_metadata->>'height')::integer or a.media_type is distinct from p_metadata->>'mediaType' then raise exception 'STUDIO_REQUEST_CONFLICT'; end if;
    return to_jsonb(a);
  end if;
  if (select count(*) from public.assets where kind = 'reference' and user_id = p_owner_id) >= 10 or (select count(*) from public.assets where kind = 'reference') >= 100 then raise exception 'STUDIO_REFERENCE_LIMIT'; end if;
  insert into public.assets(id,user_id,kind,reference_request_id,storage_path,filename,media_type,width,height,byte_size,sha256)
    values (asset_id,p_owner_id,'reference',p_request_id,p_owner_id::text || '/references/' || asset_id::text || '/image',p_filename,p_metadata->>'mediaType',(p_metadata->>'width')::integer,(p_metadata->>'height')::integer,(p_metadata->>'bytes')::integer,p_metadata->>'sha256') returning * into a;
  return to_jsonb(a);
end;
$$;

create function public.studio_complete_reference(p_asset_id uuid, p_owner_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare a public.assets;
begin
  update public.assets set ready = true where id = p_asset_id and user_id = p_owner_id and kind = 'reference' returning * into a;
  if not found then raise exception 'STUDIO_ASSET_NOT_FOUND'; end if;
  return to_jsonb(a);
end;
$$;

create function public.studio_get_quota()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('enabled',enabled,'consumed',consumed + legacy_offset,'global_limit',global_limit,'user_limit',user_limit)
    from studio_private.studio_quota where singleton;
$$;

-- Explicit function grants: Postgres otherwise gives PUBLIC execution by default.
revoke all on function public.studio_reserve_job(uuid,uuid,text,text,text,text,uuid,text), public.studio_link_run(uuid,text,text), public.studio_claim_job(uuid,text), public.studio_begin_provider(uuid,text), public.studio_save_output_metadata(uuid,text,jsonb), public.studio_complete_job(uuid,text,jsonb), public.studio_fail_job(uuid,text,text,text,boolean), public.studio_reserve_reference(uuid,uuid,text,jsonb,text), public.studio_complete_reference(uuid,uuid), public.studio_get_quota() from public, anon, authenticated;
grant execute on function public.studio_reserve_job(uuid,uuid,text,text,text,text,uuid,text), public.studio_link_run(uuid,text,text), public.studio_claim_job(uuid,text), public.studio_begin_provider(uuid,text), public.studio_save_output_metadata(uuid,text,jsonb), public.studio_complete_job(uuid,text,jsonb), public.studio_fail_job(uuid,text,text,text,boolean), public.studio_reserve_reference(uuid,uuid,text,jsonb,text), public.studio_complete_reference(uuid,uuid), public.studio_get_quota() to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values ('studio-private','studio-private',false,16777216,array['image/png','image/jpeg','image/webp']);
create policy studio_storage_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'studio-private' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Restrictive guards also protect this bucket if unrelated broad policies are added later.
create policy studio_storage_no_user_insert on storage.objects as restrictive for insert to anon,authenticated with check (bucket_id <> 'studio-private');
create policy studio_storage_no_user_update on storage.objects as restrictive for update to anon,authenticated using (bucket_id <> 'studio-private') with check (bucket_id <> 'studio-private');
create policy studio_storage_no_user_delete on storage.objects as restrictive for delete to anon,authenticated using (bucket_id <> 'studio-private');
create policy studio_storage_owner_guard on storage.objects as restrictive for select to anon,authenticated
  using (bucket_id <> 'studio-private' or (storage.foldername(name))[1] = (select auth.uid())::text);
