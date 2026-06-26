import { createClient } from '@supabase/supabase-js'

/**
 * Cliente Supabase para el servidor local (service role / secret key).
 * Requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env
 */
export function createServerSupabaseClient() {
  const url = process.env.SUPABASE_URL?.trim()
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim()
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Host del proyecto (sin credenciales), para cruzar con el dashboard de Supabase. */
export function supabasePublicHost() {
  const url = process.env.SUPABASE_URL?.trim()
  if (!url) return null
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}
