import type { SiteId } from '../domain/sites'

export type ColumnRole =
  | 'timestamp'
  | 'event'
  | 'location'
  | 'visitId'
  | 'plate'
  | 'docNumber'
  | 'site'
  | 'product'
  | 'cargoForm'

export interface ColumnMapping {
  timestamp?: string
  event?: string
  location?: string
  visitId?: string
  plate?: string
  docNumber?: string
  site?: string
  product?: string
  cargoForm?: string
}

export interface ImportConfig {
  siteId: SiteId
  mapping: ColumnMapping
  headerHash?: string
  fileName?: string
}

export type RawRow = Record<string, unknown>

export interface ParsedFile {
  headers: string[]
  rows: RawRow[]
  fileName?: string
}
