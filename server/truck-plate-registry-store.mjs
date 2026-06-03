const TABLE = 'truck_plate_registry'

function rowToEntry(row) {
  return {
    id: String(row.id),
    plate: String(row.plate_normalized ?? row.plate ?? ''),
    category: row.category,
    active: Boolean(row.active),
    excludeFromAnalytics: Boolean(row.exclude_from_analytics),
    notes: row.notes ?? undefined,
    label: row.label ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createSupabasePlateRegistryStore(supabase) {
  return {
    mode: 'supabase',

    async readRegistry() {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .order('updated_at', { ascending: false })
      if (error) throw new Error(error.message)
      const entries = (data ?? []).map(rowToEntry)
      const updatedAt =
        entries[0]?.updatedAt ?? new Date().toISOString()
      return { version: 1, updatedAt, entries }
    },

    async findActiveByPlate(plateNormalized) {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('plate_normalized', plateNormalized)
        .eq('active', true)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data ? rowToEntry(data) : null
    },

    async createEntry(fields) {
      const { data, error } = await supabase
        .from(TABLE)
        .insert({
          plate: fields.plate,
          category: fields.category,
          active: fields.active,
          exclude_from_analytics: fields.excludeFromAnalytics,
          notes: fields.notes ?? null,
          label: fields.label ?? null,
          created_by: fields.createdBy ?? null,
        })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return rowToEntry(data)
    },

    async updateEntry(id, fields) {
      const patch = { updated_at: new Date().toISOString() }
      if (fields.plate) patch.plate = fields.plate
      if (fields.category) patch.category = fields.category
      if (fields.active !== undefined) patch.active = fields.active
      if (fields.excludeFromAnalytics !== undefined) {
        patch.exclude_from_analytics = fields.excludeFromAnalytics
      }
      if (fields.notes !== undefined) patch.notes = fields.notes ?? null
      if (fields.label !== undefined) patch.label = fields.label ?? null

      const { data, error } = await supabase
        .from(TABLE)
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      if (!data) throw new Error('Entrada no encontrada')
      return rowToEntry(data)
    },

    async deleteEntry(id, { hard = false } = {}) {
      if (hard) {
        const { error } = await supabase.from(TABLE).delete().eq('id', id)
        if (error) throw new Error(error.message)
        return
      }
      const { error } = await supabase
        .from(TABLE)
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },

    async getEntryById(id) {
      const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle()
      if (error) throw new Error(error.message)
      return data ? rowToEntry(data) : null
    },
  }
}

export function createJsonPlateRegistryStore({
  registryFile,
  ensureDir,
  writeJsonAtomic,
  readJsonIfExists,
  registryRoot,
}) {
  async function readRegistry() {
    const doc = await readJsonIfExists(registryFile)
    if (doc && typeof doc === 'object' && Array.isArray(doc.entries)) {
      return {
        version: 1,
        updatedAt: String(doc.updatedAt ?? new Date().toISOString()),
        entries: doc.entries,
      }
    }
    return { version: 1, updatedAt: new Date().toISOString(), entries: [] }
  }

  async function writeRegistry(doc) {
    await ensureDir(registryRoot)
    doc.version = 1
    doc.updatedAt = new Date().toISOString()
    await writeJsonAtomic(registryFile, doc)
    return doc
  }

  return {
    mode: 'json',
    readRegistry,
    writeRegistry,
    registryFile,
    registryRoot,
  }
}
