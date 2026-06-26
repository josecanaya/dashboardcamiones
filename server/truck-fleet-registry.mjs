/**
 * Registro de visitas a planta + ficha de camión — Supabase o JSON local.
 */
import path from 'path'
import { createServerSupabaseClient, supabasePublicHost } from './supabase-client.mjs'
import {
  createJsonFleetStore,
  createSupabaseFleetStore,
  normalizePlate,
  passesCamionPlateDbConstraint,
} from './truck-fleet-store.mjs'

export function createTruckFleetRouter({
  projectRoot,
  ensureDir,
  writeJsonAtomic,
  readJsonIfExists,
  lookupRegistryEntry,
}) {
  const FLEET_ROOT = path.join(projectRoot, 'data', 'truck-fleet')
  const FLEET_FILE = path.join(FLEET_ROOT, 'fleet.json')

  const supabase = createServerSupabaseClient()
  const store = supabase ?
    createSupabaseFleetStore(supabase)
  : createJsonFleetStore({
      fleetFile: FLEET_FILE,
      fleetRoot: FLEET_ROOT,
      ensureDir,
      writeJsonAtomic,
      readJsonIfExists,
    })

  async function registryLookup(plate) {
    if (!lookupRegistryEntry) return null
    return lookupRegistryEntry(plate)
  }

  const router = {
    fleetRoot: FLEET_ROOT,
    fleetFile: FLEET_FILE,
    storageMode: store.mode,

    async status(_req, res) {
      try {
        const supabaseHost = supabasePublicHost()
        const stats = typeof store.getStorageStats === 'function' ? await store.getStorageStats() : null
        if (store.mode === 'supabase' && supabase) {
          const { error } = await supabase.from('camion').select('plate_normalized').limit(1)
          if (error) {
            res.status(503).json({
              storage: 'supabase',
              ready: false,
              supabaseHost,
              error: error.message,
              hint: '¿Aplicaste supabase/migrations/20260625120000_camion_visita_planta.sql?',
            })
            return
          }
          res.json({
            storage: 'supabase',
            ready: true,
            supabaseHost,
            counts: stats ?
              { camion: stats.camion, visitaPlanta: stats.visitaPlanta }
            : null,
            countsError: stats?.error ?? null,
          })
          return
        }
        res.json({
          storage: 'json',
          ready: true,
          fleetFile: FLEET_FILE,
          counts: stats ?
            { camion: stats.camion, visitaPlanta: stats.visitaPlanta }
          : null,
        })
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
      }
    },

    async lookup(req, res) {
      try {
        const plate = normalizePlate(req.query?.plate ?? req.body?.plate)
        if (!plate) {
          res.status(400).json({ error: 'query plate es obligatorio' })
          return
        }
        if (!passesCamionPlateDbConstraint(plate)) {
          res.status(400).json({
            error:
              'Patente inválida para la base (formato Argentina: 6 u 7 caracteres, ej. ABC123 o AB123CD).',
          })
          return
        }
        const { camion, visitas } = await store.getProfile(plate)
        const registryEntry = await registryLookup(plate)
        const productos = [...new Set(visitas.map((v) => v.producto).filter(Boolean))]
        res.json({
          plate,
          storage: store.mode,
          camion,
          visitas,
          registryEntry,
          summary: {
            totalVisitas: visitas.length || camion?.totalVisitas || 0,
            productosDistintos: productos,
            primeraVisitaAt: camion?.primeraVisitaAt ?? visitas.at(-1)?.ingresoAt ?? null,
            ultimaVisitaAt: camion?.ultimaVisitaAt ?? visitas[0]?.ingresoAt ?? null,
          },
        })
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
      }
    },

    async updateCamion(req, res) {
      try {
        const plate = normalizePlate(req.params?.plate ?? req.body?.plate)
        if (!plate) {
          res.status(400).json({ error: 'plate obligatorio' })
          return
        }
        const body = req.body ?? {}
        const profile = await store.getProfile(plate)
        if (!profile.camion) {
          const camion = await store.upsertCamion({
            plateNormalized: plate,
            plateDisplay: body.plateDisplay ?? plate,
            transportista: body.transportista,
            tipoVinculo: body.tipoVinculo,
            marca: body.marca,
            color: body.color,
            tipoVehiculo: body.tipoVehiculo,
            notas: body.notas,
          })
          res.json({ camion, storage: store.mode })
          return
        }
        const camion = await store.updateCamion(plate, {
          transportista: body.transportista,
          tipoVinculo: body.tipoVinculo,
          marca: body.marca,
          color: body.color,
          tipoVehiculo: body.tipoVehiculo,
          notas: body.notas,
          plateDisplay: body.plateDisplay,
        })
        res.json({ camion, storage: store.mode })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        res.status(msg.includes('no encontrado') ? 404 : 500).json({ error: msg })
      }
    },

    async syncVisitas(req, res) {
      try {
        const visitas = req.body?.visitas
        if (!Array.isArray(visitas)) {
          res.status(400).json({ error: 'body.visitas debe ser un array' })
          return
        }
        const t0 = Date.now()
        console.info(`[fleet-sync] inicio lote n=${visitas.length}`)
        const result = await store.syncVisitas(visitas)
        console.info(`[fleet-sync] fin lote ${Date.now() - t0}ms`, result)
        let warning = null
        if (
          result.inserted > 0 &&
          result.dbCounts &&
          result.dbCountsBefore &&
          !result.dbCounts.error
        ) {
          const delta = result.dbCounts.visitaPlanta - result.dbCountsBefore.visitaPlanta
          if (delta <= 0) {
            warning =
              'Procesamos el lote pero el conteo en visita_planta no subió. Confirmá que SUPABASE_URL en .env apunta al mismo proyecto que ves en el dashboard (tablas public.camion y public.visita_planta).'
          }
        }
        res.json({
          ok: true,
          storage: store.mode,
          supabase: store.mode === 'supabase',
          supabaseHost: supabasePublicHost(),
          warning,
          ...result,
        })
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
      }
    },
  }

  if (store.mode === 'supabase') {
    console.info('[fleet-registry] Almacenamiento: Supabase (camion / visita_planta)')
  } else {
    console.info('[fleet-registry] Almacenamiento: JSON local (data/truck-fleet/)')
  }

  return router
}
