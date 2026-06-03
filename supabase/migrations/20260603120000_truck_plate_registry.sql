-- Catálogo manual de patentes para excluir de métricas Truckflow / ETL.
-- No reemplaza la flota operativa DSS: solo exclusiones conocidas (servicios, particulares, asociados).

create type public.truck_plate_registry_category as enum (
  'vicentin_asociado',
  'prestador_servicio',
  'vehiculo_particular'
);

create table public.truck_plate_registry (
  id uuid primary key default gen_random_uuid(),
  plate text not null,
  plate_normalized text not null,
  category public.truck_plate_registry_category not null,
  active boolean not null default true,
  exclude_from_analytics boolean not null default true,
  label text,
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint truck_plate_registry_plate_normalized_chk check (
    plate_normalized ~ '^[A-Z0-9]+$'
    and length(plate_normalized) between 6 and 7
  )
);

comment on table public.truck_plate_registry is
  'Patentes catalogadas manualmente: asociados Vicentin, prestadores de servicio y particulares. Se usan para excluir lecturas de KPIs y reducir falsas anomalías.';

comment on column public.truck_plate_registry.exclude_from_analytics is
  'Si true, el ETL/dashboard omite eventos y viajes de esta patente en conteos ejecutivos.';

create unique index truck_plate_registry_active_plate_uniq
  on public.truck_plate_registry (plate_normalized)
  where (active = true);

create index truck_plate_registry_category_idx
  on public.truck_plate_registry (category)
  where (active = true);

create or replace function public.normalize_argentina_plate(raw text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(regexp_replace(trim(coalesce(raw, '')), '[\s-]+', '', 'g'), '[^A-Z0-9]', '', 'g'));
$$;

create or replace function public.truck_plate_registry_set_normalized()
returns trigger
language plpgsql
as $$
begin
  new.plate_normalized := public.normalize_argentina_plate(new.plate);
  new.updated_at := now();
  return new;
end;
$$;

create trigger truck_plate_registry_biur_normalize
  before insert or update on public.truck_plate_registry
  for each row execute function public.truck_plate_registry_set_normalized();

-- Vista rápida para el backend / edge functions
create or replace view public.truck_plate_registry_active_exclusions as
select
  id,
  plate_normalized as plate,
  category,
  label,
  notes,
  updated_at
from public.truck_plate_registry
where active = true and exclude_from_analytics = true;

-- RLS: ajustar roles según su proyecto (ejemplo conservador)
alter table public.truck_plate_registry enable row level security;

create policy truck_plate_registry_read_authenticated
  on public.truck_plate_registry
  for select
  to authenticated
  using (true);

create policy truck_plate_registry_write_service
  on public.truck_plate_registry
  for all
  to service_role
  using (true)
  with check (true);

-- Ejemplo de carga manual (descomentar y editar):
-- insert into public.truck_plate_registry (plate, category, label, notes, created_by)
-- values
--   ('AB123CD', 'prestador_servicio', 'Mantenimiento eléctrico', 'No descarga mercadería', 'ops@vicentin'),
--   ('AC000ZZ', 'vehiculo_particular', null, 'Visita administrativa', 'ops@vicentin'),
--   ('AF111BB', 'vicentin_asociado', 'Transporte diario', 'Asociado planta', 'ops@vicentin');
