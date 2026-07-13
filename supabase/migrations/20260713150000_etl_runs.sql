-- Corridas ETL headless (Fase 4): metadatos + índice de tablas.
-- Archivos pesados (CSV/JSON de tablas) viven en Storage bucket `etl-runs`.
-- Idempotente: se puede re-ejecutar si falló a medias.

create table if not exists public.etl_runs (
  run_id text primary key,
  status text not null default 'running',
  rules_version text,
  started_at timestamptz,
  finished_at timestamptz,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  stats jsonb,
  error text,
  storage_prefix text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint etl_runs_status_chk check (
    status in ('running', 'ok', 'error')
  )
);

comment on table public.etl_runs is
  'Corridas del runner headless (scripts/run-etl-headless.ts). Disco local runs/ es caché; esta tabla + Storage son la persistencia remota.';

comment on column public.etl_runs.stats is
  'Copia de stats.json (KPIs ejecutivos) para consultas sin bajar Storage.';

comment on column public.etl_runs.storage_prefix is
  'Prefijo en bucket etl-runs, p.ej. 20260713-141450-9d05bc/';

create table if not exists public.etl_run_tables (
  id uuid primary key default gen_random_uuid(),
  run_id text not null references public.etl_runs (run_id) on delete cascade,
  table_name text not null,
  row_count integer,
  storage_json_path text,
  storage_csv_path text,
  created_at timestamptz not null default now(),
  constraint etl_run_tables_name_chk check (
    table_name ~ '^[a-zA-Z0-9_]+$'
  ),
  constraint etl_run_tables_run_name_uniq unique (run_id, table_name)
);

comment on table public.etl_run_tables is
  'Índice de tablas emitidas por una corrida; apunta a objetos en Storage.';

create index if not exists etl_runs_started_at_idx
  on public.etl_runs (started_at desc nulls last);

create index if not exists etl_runs_status_idx
  on public.etl_runs (status);

create index if not exists etl_run_tables_run_id_idx
  on public.etl_run_tables (run_id);

create or replace function public.etl_runs_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists etl_runs_bu_touch on public.etl_runs;
create trigger etl_runs_bu_touch
  before update on public.etl_runs
  for each row execute function public.etl_runs_touch_updated_at();

alter table public.etl_runs enable row level security;
alter table public.etl_run_tables enable row level security;

drop policy if exists etl_runs_read_authenticated on public.etl_runs;
create policy etl_runs_read_authenticated
  on public.etl_runs for select to authenticated using (true);

drop policy if exists etl_runs_write_service on public.etl_runs;
create policy etl_runs_write_service
  on public.etl_runs for all to service_role using (true) with check (true);

drop policy if exists etl_run_tables_read_authenticated on public.etl_run_tables;
create policy etl_run_tables_read_authenticated
  on public.etl_run_tables for select to authenticated using (true);

drop policy if exists etl_run_tables_write_service on public.etl_run_tables;
create policy etl_run_tables_write_service
  on public.etl_run_tables for all to service_role using (true) with check (true);

-- Bucket privado para artefactos de corrida (manifest, stats, logs, tables/*)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'etl-runs',
  'etl-runs',
  false,
  104857600, -- 100 MiB por objeto
  array['application/json', 'text/csv', 'text/plain', 'application/octet-stream']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists etl_runs_storage_service on storage.objects;
create policy etl_runs_storage_service
  on storage.objects
  for all
  to service_role
  using (bucket_id = 'etl-runs')
  with check (bucket_id = 'etl-runs');

drop policy if exists etl_runs_storage_read_authenticated on storage.objects;
create policy etl_runs_storage_read_authenticated
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'etl-runs');
