-- Ficha operativa de camiones y visitas a planta (patente, fecha/hora, producto).
-- Complementa truck_plate_registry (exclusiones ETL), no lo reemplaza.
-- Idempotente: se puede volver a ejecutar si falló a medias (p. ej. camion ya existía).

create table if not exists public.camion (
  plate_normalized text primary key,
  plate_display text,
  transportista text,
  tipo_vinculo text,
  marca text,
  color text,
  tipo_vehiculo text,
  notas text,
  primera_visita_at timestamptz,
  ultima_visita_at timestamptz,
  total_visitas integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint camion_plate_normalized_chk check (
    plate_normalized ~ '^[A-Z0-9]+$'
    and length(plate_normalized) between 6 and 7
  )
);

comment on table public.camion is
  'Ficha por patente: transportista, marca, color. Se crea al sincronizar visitas desde Truckflow/Excel.';

create table if not exists public.visita_planta (
  id uuid primary key default gen_random_uuid(),
  plate_normalized text not null references public.camion (plate_normalized) on delete cascade,
  planta text not null default 'ricardone',
  ingreso_at timestamptz not null,
  egreso_at timestamptz,
  fecha_operativa date not null,
  producto text,
  producto_origen text,
  journey_uid text,
  fuente text not null default 'truckflow',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visita_planta_producto_origen_chk check (
    producto_origen is null
    or producto_origen in ('contrato', 'manual', 'desconocido')
  ),
  constraint visita_planta_fuente_chk check (
    fuente in ('truckflow', 'contrato', 'mixto')
  )
);

comment on table public.visita_planta is
  'Una fila por viaje/journey dentro de planta. Producto cuando hay cruce con Movimientos por contrato.';

create unique index if not exists visita_planta_journey_uid_uniq
  on public.visita_planta (journey_uid)
  where journey_uid is not null;

create index if not exists visita_planta_plate_fecha_idx
  on public.visita_planta (plate_normalized, fecha_operativa desc);

create index if not exists visita_planta_fecha_idx
  on public.visita_planta (fecha_operativa desc);

create or replace function public.camion_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists camion_bu_touch on public.camion;
create trigger camion_bu_touch
  before update on public.camion
  for each row execute function public.camion_touch_updated_at();

drop trigger if exists visita_planta_bu_touch on public.visita_planta;
create trigger visita_planta_bu_touch
  before update on public.visita_planta
  for each row execute function public.camion_touch_updated_at();

alter table public.camion enable row level security;
alter table public.visita_planta enable row level security;

drop policy if exists camion_read_authenticated on public.camion;
create policy camion_read_authenticated
  on public.camion for select to authenticated using (true);

drop policy if exists camion_write_service on public.camion;
create policy camion_write_service
  on public.camion for all to service_role using (true) with check (true);

drop policy if exists visita_planta_read_authenticated on public.visita_planta;
create policy visita_planta_read_authenticated
  on public.visita_planta for select to authenticated using (true);

drop policy if exists visita_planta_write_service on public.visita_planta;
create policy visita_planta_write_service
  on public.visita_planta for all to service_role using (true) with check (true);
