-- Tabla para almacenar refresh tokens de Google CIFRADOS (AES-256-GCM).
-- Solo accesible con la service_role key desde el servidor MCP.
-- El contenido de `sealed` ya viene cifrado por la app; la DB nunca ve el token en claro.

create table if not exists public.mcp_google_oauth_tokens (
  user_id     text primary key,
  sealed      jsonb not null,            -- { v, iv, tag, data } del cifrado app-side
  updated_at  timestamptz not null default now()
);

comment on table public.mcp_google_oauth_tokens is
  'Refresh tokens de Google cifrados app-side (mcp-google-slides). Acceso solo service_role.';

-- Habilitar RLS y NO crear políticas: así ningún cliente anónimo/authenticated
-- puede leer. El servidor usa la service_role key, que bypassa RLS.
alter table public.mcp_google_oauth_tokens enable row level security;
