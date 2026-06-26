const CAMION_TABLE = 'camion'
const VISITA_TABLE = 'visita_planta'

function normalizePlate(raw) {
  let s = String(raw ?? '').trim().toUpperCase()
  s = s.replace(/[\s-]+/g, '')
  s = s.replace(/[^A-Z0-9]/g, '')
  return s
}

/** Misma regla que `camion_plate_normalized_chk` en Supabase. */
function passesCamionPlateDbConstraint(plate) {
  const n = String(plate ?? '')
  if (n.length < 6 || n.length > 7) return false
  return /^[A-Z0-9]+$/.test(n)
}

function rowToCamion(row) {
  return {
    plateNormalized: String(row.plate_normalized ?? ''),
    plateDisplay: row.plate_display ?? null,
    transportista: row.transportista ?? null,
    tipoVinculo: row.tipo_vinculo ?? null,
    marca: row.marca ?? null,
    color: row.color ?? null,
    tipoVehiculo: row.tipo_vehiculo ?? null,
    notas: row.notas ?? null,
    primeraVisitaAt: row.primera_visita_at ?? null,
    ultimaVisitaAt: row.ultima_visita_at ?? null,
    totalVisitas: Number(row.total_visitas ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const FUENTE_OK = new Set(['truckflow', 'contrato', 'mixto'])
const PRODUCTO_ORIGEN_OK = new Set(['contrato', 'manual', 'desconocido'])

function sanitizeVisitaDbRow(row) {
  const fecha = String(row.fecha_operativa ?? '').slice(0, 10)
  const origen = row.producto_origen
  const fuente = row.fuente
  return {
    ...row,
    fecha_operativa: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : String(row.ingreso_at ?? '').slice(0, 10),
    producto_origen:
      origen && PRODUCTO_ORIGEN_OK.has(String(origen)) ? String(origen) : null,
    fuente: fuente && FUENTE_OK.has(String(fuente)) ? String(fuente) : 'truckflow',
  }
}

async function countFleetTables(supabase) {
  const [camionRes, visitaRes] = await Promise.all([
    supabase.from(CAMION_TABLE).select('*', { count: 'exact', head: true }),
    supabase.from(VISITA_TABLE).select('*', { count: 'exact', head: true }),
  ])
  const err = camionRes.error?.message || visitaRes.error?.message || null
  return {
    camion: camionRes.count ?? 0,
    visitaPlanta: visitaRes.count ?? 0,
    error: err,
  }
}

function rowToVisita(row) {
  return {
    id: String(row.id),
    plateNormalized: String(row.plate_normalized ?? ''),
    planta: String(row.planta ?? ''),
    ingresoAt: row.ingreso_at,
    egresoAt: row.egreso_at ?? null,
    fechaOperativa: String(row.fecha_operativa ?? '').slice(0, 10),
    producto: row.producto ?? null,
    productoOrigen: row.producto_origen ?? null,
    journeyUid: row.journey_uid ?? null,
    fuente: row.fuente ?? 'truckflow',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function upsertVisitasChunkByJourneyUidLegacy(supabase, chunk) {
  const uids = chunk.map((r) => r.journey_uid).filter(Boolean)
  const { data: existing, error: selErr } = await supabase
    .from(VISITA_TABLE)
    .select('journey_uid, id')
    .in('journey_uid', uids)
  if (selErr) throw new Error(`visita_planta: ${selErr.message}`)

  const idByUid = new Map((existing ?? []).map((r) => [String(r.journey_uid), r.id]))
  const toInsert = []
  const updateJobs = []

  for (const row of chunk) {
    const id = idByUid.get(String(row.journey_uid))
    if (id) {
      updateJobs.push(
        supabase.from(VISITA_TABLE).update(row).eq('id', id).then(({ error }) => {
          if (error) throw new Error(`visita_planta: ${error.message}`)
        })
      )
    } else {
      toInsert.push(row)
    }
  }

  const concurrency = 12
  for (let i = 0; i < updateJobs.length; i += concurrency) {
    await Promise.all(updateJobs.slice(i, i + concurrency))
  }

  if (toInsert.length) {
    const { error } = await supabase.from(VISITA_TABLE).insert(toInsert)
    if (error) throw new Error(`visita_planta: ${error.message}`)
  }
}

async function upsertVisitasChunkByJourneyUid(supabase, chunk) {
  if (!chunk.length) return
  const rows = chunk.map(sanitizeVisitaDbRow)
  await upsertVisitasChunkByJourneyUidLegacy(supabase, rows)
}

export function createSupabaseFleetStore(supabase) {
  return {
    mode: 'supabase',

    async getStorageStats() {
      return countFleetTables(supabase)
    },

    async getProfile(plateNormalized) {
      const plate = normalizePlate(plateNormalized)
      if (!plate) return { camion: null, visitas: [] }

      const [{ data: camionRow }, { data: visitasRows }] = await Promise.all([
        supabase.from(CAMION_TABLE).select('*').eq('plate_normalized', plate).maybeSingle(),
        supabase
          .from(VISITA_TABLE)
          .select('*')
          .eq('plate_normalized', plate)
          .order('ingreso_at', { ascending: false })
          .limit(200),
      ])

      return {
        camion: camionRow ? rowToCamion(camionRow) : null,
        visitas: (visitasRows ?? []).map(rowToVisita),
      }
    },

    async upsertCamion(patch) {
      const plate = normalizePlate(patch.plateNormalized ?? patch.plate)
      if (!plate) throw new Error('plate_normalized obligatorio')

      const row = {
        plate_normalized: plate,
        plate_display: patch.plateDisplay ?? patch.plate_display ?? plate,
        transportista: patch.transportista ?? null,
        tipo_vinculo: patch.tipoVinculo ?? patch.tipo_vinculo ?? null,
        marca: patch.marca ?? null,
        color: patch.color ?? null,
        tipo_vehiculo: patch.tipoVehiculo ?? patch.tipo_vehiculo ?? null,
        notas: patch.notas ?? null,
        updated_at: new Date().toISOString(),
      }

      const { data, error } = await supabase
        .from(CAMION_TABLE)
        .upsert(row, { onConflict: 'plate_normalized' })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return rowToCamion(data)
    },

    async updateCamion(plateNormalized, fields) {
      const plate = normalizePlate(plateNormalized)
      const patch = { updated_at: new Date().toISOString() }
      if (fields.transportista !== undefined) patch.transportista = fields.transportista || null
      if (fields.tipoVinculo !== undefined) patch.tipo_vinculo = fields.tipoVinculo || null
      if (fields.marca !== undefined) patch.marca = fields.marca || null
      if (fields.color !== undefined) patch.color = fields.color || null
      if (fields.tipoVehiculo !== undefined) patch.tipo_vehiculo = fields.tipoVehiculo || null
      if (fields.notas !== undefined) patch.notas = fields.notas || null
      if (fields.plateDisplay !== undefined) patch.plate_display = fields.plateDisplay || plate

      const { data, error } = await supabase
        .from(CAMION_TABLE)
        .update(patch)
        .eq('plate_normalized', plate)
        .select()
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) throw new Error('Camión no encontrado')
      return rowToCamion(data)
    },

    async syncVisitas(visitas) {
      const list = Array.isArray(visitas) ? visitas : []
      const countsBefore = await countFleetTables(supabase)
      let skipped = 0
      const now = new Date().toISOString()
      const camionByPlate = new Map()
      const withUid = []
      const withoutUid = []

      for (const v of list) {
        const plate = normalizePlate(v.plateNormalized ?? v.plate)
        const journeyUid = v.journeyUid ? String(v.journeyUid).trim() : ''
        const ingresoAt = v.ingresoAt
        if (!plate || !ingresoAt) {
          skipped++
          continue
        }
        if (!passesCamionPlateDbConstraint(plate)) {
          skipped++
          continue
        }
        camionByPlate.set(plate, {
          plate_normalized: plate,
          plate_display: v.plateDisplay ?? plate,
          updated_at: now,
        })
        const fechaOperativa = String(v.fechaOperativa ?? ingresoAt).slice(0, 10)
        const visitaRow = sanitizeVisitaDbRow({
          plate_normalized: plate,
          planta: String(v.planta ?? 'ricardone').toLowerCase(),
          ingreso_at: ingresoAt,
          egreso_at: v.egresoAt ?? null,
          fecha_operativa: fechaOperativa,
          producto: v.producto ?? null,
          producto_origen: v.productoOrigen ?? null,
          journey_uid: journeyUid || null,
          fuente: v.fuente ?? 'truckflow',
          updated_at: now,
        })
        if (journeyUid) withUid.push(visitaRow)
        else withoutUid.push(visitaRow)
      }

      const camionRows = [...camionByPlate.values()]
      if (camionRows.length) {
        const { error: camionErr } = await supabase
          .from(CAMION_TABLE)
          .upsert(camionRows, { onConflict: 'plate_normalized' })
        if (camionErr) throw new Error(`camion: ${camionErr.message}`)
      }

      const chunkSize = 100
      let synced = 0

      for (let i = 0; i < withUid.length; i += chunkSize) {
        const chunk = withUid.slice(i, i + chunkSize)
        await upsertVisitasChunkByJourneyUid(supabase, chunk)
        synced += chunk.length
      }

      for (let i = 0; i < withoutUid.length; i += chunkSize) {
        const chunk = withoutUid.slice(i, i + chunkSize).map(sanitizeVisitaDbRow)
        const { error } = await supabase.from(VISITA_TABLE).insert(chunk)
        if (error) throw new Error(`visita_planta: ${error.message}`)
        synced += chunk.length
      }

      const countsAfter = await countFleetTables(supabase)

      return {
        inserted: synced,
        updated: 0,
        skipped,
        plates: camionByPlate.size,
        dbCounts: countsAfter,
        dbCountsBefore: countsBefore,
      }
    },
  }
}

export function createJsonFleetStore({ fleetFile, fleetRoot, ensureDir, writeJsonAtomic, readJsonIfExists }) {
  async function readDoc() {
    const doc = await readJsonIfExists(fleetFile)
    if (doc && typeof doc === 'object') {
      return {
        version: 1,
        updatedAt: String(doc.updatedAt ?? new Date().toISOString()),
        camiones: doc.camiones && typeof doc.camiones === 'object' ? doc.camiones : {},
        visitas: Array.isArray(doc.visitas) ? doc.visitas : [],
      }
    }
    return { version: 1, updatedAt: new Date().toISOString(), camiones: {}, visitas: [] }
  }

  async function writeDoc(doc) {
    await ensureDir(fleetRoot)
    doc.version = 1
    doc.updatedAt = new Date().toISOString()
    await writeJsonAtomic(fleetFile, doc)
    return doc
  }

  function camionFromStore(plate, raw) {
    return {
      plateNormalized: plate,
      plateDisplay: raw.plateDisplay ?? plate,
      transportista: raw.transportista ?? null,
      tipoVinculo: raw.tipoVinculo ?? null,
      marca: raw.marca ?? null,
      color: raw.color ?? null,
      tipoVehiculo: raw.tipoVehiculo ?? null,
      notas: raw.notas ?? null,
      primeraVisitaAt: raw.primeraVisitaAt ?? null,
      ultimaVisitaAt: raw.ultimaVisitaAt ?? null,
      totalVisitas: Number(raw.totalVisitas ?? 0),
      createdAt: raw.createdAt ?? docFallbackNow(),
      updatedAt: raw.updatedAt ?? docFallbackNow(),
    }
  }

  function docFallbackNow() {
    return new Date().toISOString()
  }

  return {
    mode: 'json',
    fleetFile,
    fleetRoot,

    async getStorageStats() {
      const doc = await readDoc()
      return {
        camion: Object.keys(doc.camiones).length,
        visitaPlanta: doc.visitas.length,
        error: null,
      }
    },

    async getProfile(plateNormalized) {
      const plate = normalizePlate(plateNormalized)
      const doc = await readDoc()
      const raw = doc.camiones[plate]
      const visitas = doc.visitas
        .filter((v) => normalizePlate(v.plateNormalized) === plate)
        .sort((a, b) => String(b.ingresoAt).localeCompare(String(a.ingresoAt)))
        .slice(0, 200)
        .map((v) => ({
          id: String(v.id),
          plateNormalized: plate,
          planta: v.planta,
          ingresoAt: v.ingresoAt,
          egresoAt: v.egresoAt ?? null,
          fechaOperativa: v.fechaOperativa,
          producto: v.producto ?? null,
          productoOrigen: v.productoOrigen ?? null,
          journeyUid: v.journeyUid ?? null,
          fuente: v.fuente ?? 'truckflow',
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,
        }))
      return {
        camion: raw ? camionFromStore(plate, raw) : null,
        visitas,
      }
    },

    async upsertCamion(patch) {
      const plate = normalizePlate(patch.plateNormalized ?? patch.plate)
      if (!plate) throw new Error('plate_normalized obligatorio')
      const doc = await readDoc()
      const now = new Date().toISOString()
      const prev = doc.camiones[plate] ?? {}
      doc.camiones[plate] = {
        ...prev,
        plateDisplay: patch.plateDisplay ?? prev.plateDisplay ?? plate,
        transportista: patch.transportista ?? prev.transportista ?? null,
        tipoVinculo: patch.tipoVinculo ?? prev.tipoVinculo ?? null,
        marca: patch.marca ?? prev.marca ?? null,
        color: patch.color ?? prev.color ?? null,
        tipoVehiculo: patch.tipoVehiculo ?? prev.tipoVehiculo ?? null,
        notas: patch.notas ?? prev.notas ?? null,
        createdAt: prev.createdAt ?? now,
        updatedAt: now,
      }
      await writeDoc(doc)
      return camionFromStore(plate, doc.camiones[plate])
    },

    async updateCamion(plateNormalized, fields) {
      const plate = normalizePlate(plateNormalized)
      const doc = await readDoc()
      if (!doc.camiones[plate]) throw new Error('Camión no encontrado')
      const prev = doc.camiones[plate]
      const now = new Date().toISOString()
      doc.camiones[plate] = {
        ...prev,
        transportista: fields.transportista !== undefined ? fields.transportista || null : prev.transportista,
        tipoVinculo: fields.tipoVinculo !== undefined ? fields.tipoVinculo || null : prev.tipoVinculo,
        marca: fields.marca !== undefined ? fields.marca || null : prev.marca,
        color: fields.color !== undefined ? fields.color || null : prev.color,
        tipoVehiculo: fields.tipoVehiculo !== undefined ? fields.tipoVehiculo || null : prev.tipoVehiculo,
        notas: fields.notas !== undefined ? fields.notas || null : prev.notas,
        plateDisplay: fields.plateDisplay !== undefined ? fields.plateDisplay || plate : prev.plateDisplay,
        updatedAt: now,
      }
      await writeDoc(doc)
      return camionFromStore(plate, doc.camiones[plate])
    },

    async syncVisitas(visitas) {
      const list = Array.isArray(visitas) ? visitas : []
      const doc = await readDoc()
      let inserted = 0
      let updated = 0
      let skipped = 0
      const journeyIndex = new Map()
      for (let i = 0; i < doc.visitas.length; i++) {
        const uid = doc.visitas[i]?.journeyUid
        if (uid) journeyIndex.set(String(uid), i)
      }

      for (const v of list) {
        const plate = normalizePlate(v.plateNormalized ?? v.plate)
        const ingresoAt = v.ingresoAt
        if (!plate || !ingresoAt) {
          skipped++
          continue
        }
        if (!passesCamionPlateDbConstraint(plate)) {
          skipped++
          continue
        }
        const now = new Date().toISOString()
        if (!doc.camiones[plate]) {
          doc.camiones[plate] = {
            plateDisplay: v.plateDisplay ?? plate,
            totalVisitas: 0,
            createdAt: now,
            updatedAt: now,
          }
        }
        const visitaPayload = {
          id: `vis_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
          plateNormalized: plate,
          planta: String(v.planta ?? 'ricardone').toLowerCase(),
          ingresoAt,
          egresoAt: v.egresoAt ?? null,
          fechaOperativa: v.fechaOperativa ?? String(ingresoAt).slice(0, 10),
          producto: v.producto ?? null,
          productoOrigen: v.productoOrigen ?? null,
          journeyUid: v.journeyUid ? String(v.journeyUid) : null,
          fuente: v.fuente ?? 'truckflow',
          createdAt: now,
          updatedAt: now,
        }
        const uid = visitaPayload.journeyUid
        if (uid && journeyIndex.has(uid)) {
          const idx = journeyIndex.get(uid)
          visitaPayload.id = doc.visitas[idx].id
          visitaPayload.createdAt = doc.visitas[idx].createdAt ?? now
          doc.visitas[idx] = visitaPayload
          updated++
        } else {
          if (uid) journeyIndex.set(uid, doc.visitas.length)
          doc.visitas.push(visitaPayload)
          inserted++
        }
      }

      for (const plate of Object.keys(doc.camiones)) {
        const n = doc.visitas.filter((x) => normalizePlate(x.plateNormalized) === plate).length
        doc.camiones[plate].totalVisitas = n
      }

      await writeDoc(doc)
      const plates = [...new Set(list.map((v) => normalizePlate(v.plateNormalized ?? v.plate)).filter(Boolean))]
      return { inserted, updated, skipped, plates: plates.length }
    },
  }
}

export { normalizePlate, passesCamionPlateDbConstraint }
