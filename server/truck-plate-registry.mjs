/**
 * Catálogo manual de patentes — Supabase (si .env) o JSON local (fallback).
 */
import path from 'path'
import {
  createJsonPlateRegistryStore,
  createSupabasePlateRegistryStore,
} from './truck-plate-registry-store.mjs'
import { createServerSupabaseClient } from './supabase-client.mjs'

const CATEGORIES = new Set(['vicentin_asociado', 'prestador_servicio', 'vehiculo_particular'])

function normalizePlate(raw) {
  let s = String(raw ?? '').trim().toUpperCase()
  s = s.replace(/[\s-]+/g, '')
  s = s.replace(/[^A-Z0-9]/g, '')
  return s
}

function newId() {
  return `tpr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function createTruckPlateRegistryRouter({
  projectRoot,
  ensureDir,
  writeJsonAtomic,
  readJsonIfExists,
}) {
  const REGISTRY_ROOT = path.join(projectRoot, 'data', 'truck-registry')
  const REGISTRY_FILE = path.join(REGISTRY_ROOT, 'registry.json')

  const supabase = createServerSupabaseClient()
  const store = supabase ?
    createSupabasePlateRegistryStore(supabase)
  : createJsonPlateRegistryStore({
      registryFile: REGISTRY_FILE,
      registryRoot: REGISTRY_ROOT,
      ensureDir,
      writeJsonAtomic,
      readJsonIfExists,
    })

  function validateEntryBody(body, { requirePlate = true } = {}) {
    const plate = normalizePlate(body?.plate)
    if (requirePlate && !plate) return { error: 'plate es obligatorio' }
    const category = String(body?.category ?? '').trim()
    if (!CATEGORIES.has(category)) {
      return {
        error: `category debe ser: ${[...CATEGORIES].join(', ')}`,
      }
    }
    return {
      plate,
      category,
      active: body?.active !== false,
      excludeFromAnalytics: body?.excludeFromAnalytics !== false,
      notes: body?.notes != null ? String(body.notes).trim() : undefined,
      label: body?.label != null ? String(body.label).trim() : undefined,
      createdBy: body?.createdBy != null ? String(body.createdBy).trim() : undefined,
    }
  }

  const router = {
    registryRoot: REGISTRY_ROOT,
    registryFile: REGISTRY_FILE,
    storageMode: store.mode,

    async getRegistry(_req, res) {
      try {
        const doc = await store.readRegistry()
        res.json({
          ...doc,
          storage: store.mode,
          registryRoot: REGISTRY_ROOT,
          supabaseUrl: process.env.SUPABASE_URL?.trim() || null,
        })
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
      }
    },

    async lookupPlate(req, res) {
      try {
        const plate = normalizePlate(req.query?.plate ?? req.body?.plate)
        if (!plate) {
          res.status(400).json({ error: 'query plate es obligatorio' })
          return
        }
        let hit = null
        if (store.mode === 'supabase') {
          hit = await store.findActiveByPlate(plate)
        } else {
          const doc = await store.readRegistry()
          hit =
            doc.entries.find((e) => e.active && normalizePlate(e.plate) === plate) ?? null
        }
        res.json({ plate, found: Boolean(hit), entry: hit, storage: store.mode })
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
      }
    },

    async createEntry(req, res) {
      try {
        const parsed = validateEntryBody(req.body)
        if (parsed.error) {
          res.status(400).json({ error: parsed.error })
          return
        }

        if (store.mode === 'supabase') {
          const dup = await store.findActiveByPlate(parsed.plate)
          if (dup) {
            res.status(409).json({
              error: `Ya existe entrada activa para ${parsed.plate}`,
              entry: dup,
            })
            return
          }
          const entry = await store.createEntry(parsed)
          res.status(201).json({ entry, storage: 'supabase', updatedAt: entry.updatedAt })
          return
        }

        const doc = await store.readRegistry()
        const dup = doc.entries.find(
          (e) => e.active && normalizePlate(e.plate) === parsed.plate
        )
        if (dup) {
          res.status(409).json({ error: `Ya existe entrada activa para ${parsed.plate}`, entry: dup })
          return
        }
        const now = new Date().toISOString()
        const entry = {
          id: newId(),
          plate: parsed.plate,
          category: parsed.category,
          active: parsed.active,
          excludeFromAnalytics: parsed.excludeFromAnalytics,
          notes: parsed.notes || undefined,
          label: parsed.label || undefined,
          createdBy: parsed.createdBy || undefined,
          createdAt: now,
          updatedAt: now,
        }
        doc.entries.push(entry)
        const saved = await store.writeRegistry(doc)
        res.status(201).json({ entry, storage: 'json', updatedAt: saved.updatedAt })
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
      }
    },

    async updateEntry(req, res) {
      try {
        const id = String(req.params?.id ?? '').trim()
        if (!id) {
          res.status(400).json({ error: 'id obligatorio' })
          return
        }
        const parsed = validateEntryBody(req.body, { requirePlate: false })
        if (parsed.error) {
          res.status(400).json({ error: parsed.error })
          return
        }

        if (store.mode === 'supabase') {
          const prev = await store.getEntryById(id)
          if (!prev) {
            res.status(404).json({ error: 'Entrada no encontrada' })
            return
          }
          const plate = parsed.plate || normalizePlate(prev.plate)
          if (!plate) {
            res.status(400).json({ error: 'plate inválida' })
            return
          }
          if (req.body?.active !== false) {
            const conflict = await store.findActiveByPlate(plate)
            if (conflict && conflict.id !== id) {
              res.status(409).json({ error: `Patente ${plate} ya registrada`, entry: conflict })
              return
            }
          }
          const entry = await store.updateEntry(id, {
            plate,
            category: parsed.category || prev.category,
            active: req.body?.active !== undefined ? req.body.active !== false : prev.active,
            excludeFromAnalytics:
              req.body?.excludeFromAnalytics !== undefined ?
                req.body.excludeFromAnalytics !== false
              : prev.excludeFromAnalytics,
            notes: parsed.notes !== undefined ? parsed.notes || undefined : prev.notes,
            label: parsed.label !== undefined ? parsed.label || undefined : prev.label,
          })
          res.json({ entry, storage: 'supabase', updatedAt: entry.updatedAt })
          return
        }

        const doc = await store.readRegistry()
        const idx = doc.entries.findIndex((e) => e.id === id)
        if (idx < 0) {
          res.status(404).json({ error: 'Entrada no encontrada' })
          return
        }
        const prev = doc.entries[idx]
        const plate = parsed.plate || normalizePlate(prev.plate)
        if (!plate) {
          res.status(400).json({ error: 'plate inválida' })
          return
        }
        const conflict = doc.entries.find(
          (e, i) => i !== idx && e.active && normalizePlate(e.plate) === plate
        )
        if (conflict) {
          res.status(409).json({ error: `Patente ${plate} ya registrada`, entry: conflict })
          return
        }
        const now = new Date().toISOString()
        doc.entries[idx] = {
          ...prev,
          plate,
          category: parsed.category || prev.category,
          active: req.body?.active !== undefined ? req.body.active !== false : prev.active,
          excludeFromAnalytics:
            req.body?.excludeFromAnalytics !== undefined ?
              req.body.excludeFromAnalytics !== false
            : prev.excludeFromAnalytics,
          notes: parsed.notes !== undefined ? parsed.notes || undefined : prev.notes,
          label: parsed.label !== undefined ? parsed.label || undefined : prev.label,
          updatedAt: now,
        }
        const saved = await store.writeRegistry(doc)
        res.json({ entry: doc.entries[idx], storage: 'json', updatedAt: saved.updatedAt })
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
      }
    },

    async deleteEntry(req, res) {
      try {
        const id = String(req.params?.id ?? '').trim()
        const hard = String(req.query?.hard ?? '') === '1'

        if (store.mode === 'supabase') {
          const prev = await store.getEntryById(id)
          if (!prev) {
            res.status(404).json({ error: 'Entrada no encontrada' })
            return
          }
          await store.deleteEntry(id, { hard })
          res.json({ ok: true, id, hard, storage: 'supabase' })
          return
        }

        const doc = await store.readRegistry()
        const idx = doc.entries.findIndex((e) => e.id === id)
        if (idx < 0) {
          res.status(404).json({ error: 'Entrada no encontrada' })
          return
        }
        if (hard) {
          doc.entries.splice(idx, 1)
        } else {
          doc.entries[idx] = {
            ...doc.entries[idx],
            active: false,
            updatedAt: new Date().toISOString(),
          }
        }
        const saved = await store.writeRegistry(doc)
        res.json({ ok: true, id, hard, storage: 'json', updatedAt: saved.updatedAt })
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
      }
    },
  }

  if (store.mode === 'supabase') {
    console.info('[plate-registry] Almacenamiento: Supabase')
  } else {
    console.info('[plate-registry] Almacenamiento: JSON local (sin SUPABASE_URL/SERVICE_ROLE en .env)')
  }

  return router
}
