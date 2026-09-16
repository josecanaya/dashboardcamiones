import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchRunTable } from './etlRunCacheApi'

type PageResponse = {
  headers?: string[]
  total?: number
  limit?: number
  offset?: number
  rows?: Record<string, unknown>[]
}

function makeRow(i: number): Record<string, unknown> {
  return { i }
}

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function paginatedFetch(headers: string[], total: number, options: {
  failAtPage?: number
  totalOverride?: (page: number) => number
  headersOverride?: (page: number) => string[]
  offsetOverride?: (page: number, requested: number) => number
  emptyAtPage?: number
} = {}): { calls: string[]; fetch: (input: RequestInfo | URL) => Promise<Response> } {
  const calls: string[] = []
  const fetch = async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input)
    calls.push(url)
    const pageIdx = calls.length
    if (options.failAtPage === pageIdx) return new Response('boom', { status: 500 })
    const match = /offset=(\d+)/.exec(url)
    const requestedOffset = match ? Number(match[1]) : 0
    const actualOffset = options.offsetOverride ? options.offsetOverride(pageIdx, requestedOffset) : requestedOffset
    const rows = options.emptyAtPage === pageIdx
      ? []
      : Array.from(
          { length: Math.max(0, Math.min(10_000, total - requestedOffset)) },
          (_, i) => makeRow(requestedOffset + i)
        )
    const body: PageResponse = {
      headers: options.headersOverride ? options.headersOverride(pageIdx) : headers,
      total: options.totalOverride ? options.totalOverride(pageIdx) : total,
      limit: 10_000,
      offset: actualOffset,
      rows,
    }
    return jsonRes(200, body)
  }
  return { calls, fetch }
}

const origFetch = globalThis.fetch

beforeEach(() => {
  // no-op
})

afterEach(() => {
  globalThis.fetch = origFetch
  vi.restoreAllMocks()
})

describe('fetchRunTable', () => {
  it('devuelve [] real con total=0 en una sola llamada', async () => {
    const { calls, fetch } = paginatedFetch(['a'], 0)
    globalThis.fetch = fetch as typeof globalThis.fetch
    const out = await fetchRunTable('R1', 't')
    expect(out).toEqual({ headers: ['a'], rows: [] })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('offset=0')
    expect(calls[0]).toContain('limit=10000')
  })

  it('trae 9999 filas en una sola página', async () => {
    const { calls, fetch } = paginatedFetch(['i'], 9999)
    globalThis.fetch = fetch as typeof globalThis.fetch
    const out = await fetchRunTable('R', 't')
    expect(out.rows).toHaveLength(9999)
    expect(out.rows[0]).toEqual({ i: 0 })
    expect(out.rows.at(-1)).toEqual({ i: 9998 })
    expect(calls).toHaveLength(1)
  })

  it('trae 10000 filas con total=10000 en una sola página', async () => {
    const { calls, fetch } = paginatedFetch(['i'], 10_000)
    globalThis.fetch = fetch as typeof globalThis.fetch
    const out = await fetchRunTable('R', 't')
    expect(out.rows).toHaveLength(10_000)
    expect(calls).toHaveLength(1)
  })

  it('pagina 10001 filas: 10000 + 1', async () => {
    const { calls, fetch } = paginatedFetch(['i'], 10_001)
    globalThis.fetch = fetch as typeof globalThis.fetch
    const out = await fetchRunTable('R', 't')
    expect(out.rows).toHaveLength(10_001)
    expect(out.rows[10_000]).toEqual({ i: 10_000 })
    expect(calls).toHaveLength(2)
    expect(calls[0]).toContain('offset=0')
    expect(calls[1]).toContain('offset=10000')
  })

  it('pagina 25001 filas en 3 páginas y preserva el orden', async () => {
    const { calls, fetch } = paginatedFetch(['i'], 25_001)
    globalThis.fetch = fetch as typeof globalThis.fetch
    const out = await fetchRunTable('R', 't')
    expect(out.rows).toHaveLength(25_001)
    expect(calls).toHaveLength(3)
    expect(calls[0]).toContain('offset=0')
    expect(calls[1]).toContain('offset=10000')
    expect(calls[2]).toContain('offset=20000')
    for (let k = 0; k < out.rows.length; k += 1) {
      expect(out.rows[k]).toEqual({ i: k })
    }
  })

  it('lanza si la página 2 devuelve HTTP 500', async () => {
    const { fetch } = paginatedFetch(['i'], 15_000, { failAtPage: 2 })
    globalThis.fetch = fetch as typeof globalThis.fetch
    await expect(fetchRunTable('R', 't')).rejects.toThrow()
  })

  it('lanza si el total cambia entre páginas', async () => {
    const { fetch } = paginatedFetch(['i'], 20_000, {
      totalOverride: (p) => (p === 1 ? 20_000 : 19_000),
    })
    globalThis.fetch = fetch as typeof globalThis.fetch
    await expect(fetchRunTable('R', 't')).rejects.toThrow(/total cambió/)
  })

  it('lanza si los headers cambian entre páginas', async () => {
    const { fetch } = paginatedFetch(['a', 'b'], 15_000, {
      headersOverride: (p) => (p === 1 ? ['a', 'b'] : ['a', 'c']),
    })
    globalThis.fetch = fetch as typeof globalThis.fetch
    await expect(fetchRunTable('R', 't')).rejects.toThrow(/headers cambiaron/)
  })

  it('lanza si el offset devuelto no coincide con el solicitado', async () => {
    const { fetch } = paginatedFetch(['i'], 15_000, {
      offsetOverride: (p, req) => (p === 2 ? req + 5 : req),
    })
    globalThis.fetch = fetch as typeof globalThis.fetch
    await expect(fetchRunTable('R', 't')).rejects.toThrow(/offset/)
  })

  it('lanza si una página intermedia viene vacía antes de completar', async () => {
    const { fetch } = paginatedFetch(['i'], 15_000, { emptyAtPage: 2 })
    globalThis.fetch = fetch as typeof globalThis.fetch
    await expect(fetchRunTable('R', 't')).rejects.toThrow(/vacía/)
  })

  it('lanza si la primera página no trae total válido', async () => {
    globalThis.fetch = (async () =>
      jsonRes(200, { headers: ['i'], rows: [], limit: 10_000, offset: 0 })) as typeof globalThis.fetch
    await expect(fetchRunTable('R', 't')).rejects.toThrow(/total inválido/)
  })
})
