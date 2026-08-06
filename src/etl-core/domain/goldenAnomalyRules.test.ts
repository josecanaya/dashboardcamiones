import { describe, expect, it } from 'vitest'
import {
  detectRicQuickReEntry,
  detectSlThenRicSameDay,
  detectRicToSlBridgeWindow,
  detectBalanzaPlayaCelda16Route,
  detectLoadThenDischarge,
  evaluateGoldenAnomalyRules,
  GOLDEN_SL_RIC_MAX_MS,
  RIC_REINGRESO_MAX_MS,
  RIC_SL_MIN_MS,
  RIC_SL_MAX_MS,
  type GoldenTimelinePoint,
} from './goldenAnomalyRules'

const t0 = Date.parse('2026-07-10T10:00:00-03:00')

function pt(
  offsetMin: number,
  logicalCode: string,
  siteId?: string,
  day = '2026-07-10'
): GoldenTimelinePoint {
  return { t: t0 + offsetMin * 60_000, logicalCode, siteId, day }
}

describe('goldenAnomalyRules — reglas R1–R5', () => {
  describe('R1 salida Ric → reingreso Ric ≤ 1 h (no pellet)', () => {
    it('marca reingreso rápido', () => {
      const hit = detectRicQuickReEntry([
        pt(0, 'EGRESO', 'ricardone'),
        pt(45, 'INGRESO', 'ricardone'),
      ])
      expect(hit?.reason).toBe('RIC_REINGRESO_RAPIDO_NO_PELLET')
      expect(hit?.deltaMinutes).toBe(45)
    })

    it('no marca si pasa más de 1 h', () => {
      const hit = detectRicQuickReEntry([
        pt(0, 'EGRESO', 'ricardone'),
        pt(75, 'INGRESO', 'ricardone'),
      ])
      expect(hit).toBeNull()
    })

    it('no marca si es pellet o de la vuelta', () => {
      const pts = [pt(0, 'EGRESO', 'ricardone'), pt(20, 'PREINGRESO', 'ricardone')]
      expect(detectRicQuickReEntry(pts, { isPelletTransile: true })).toBeNull()
      expect(detectRicQuickReEntry(pts, { isDeVuelta: true })).toBeNull()
    })

    it('no marca si el reingreso es en otra planta', () => {
      const hit = detectRicQuickReEntry([
        pt(0, 'EGRESO', 'ricardone'),
        pt(30, 'SL_INGRESO', 'san_lorenzo'),
      ])
      expect(hit).toBeNull()
    })
  })

  describe('R2 mismo día SL primero y luego Ric (no pellet)', () => {
    it('marca San Lorenzo y luego Ricardone el mismo día', () => {
      const hit = detectSlThenRicSameDay([
        pt(0, 'SL_INGRESO', 'san_lorenzo'),
        pt(180, 'INGRESO', 'ricardone'),
      ])
      expect(hit?.reason).toBe('SL_LUEGO_RIC_MISMO_DIA_NO_PELLET')
    })

    it('no marca si Ricardone fue primero', () => {
      const hit = detectSlThenRicSameDay([
        pt(0, 'INGRESO', 'ricardone'),
        pt(180, 'SL_INGRESO', 'san_lorenzo'),
      ])
      expect(hit).toBeNull()
    })

    it('no marca si son días distintos', () => {
      const hit = detectSlThenRicSameDay([
        pt(0, 'SL_INGRESO', 'san_lorenzo', '2026-07-10'),
        pt(60, 'INGRESO', 'ricardone', '2026-07-11'),
      ])
      expect(hit).toBeNull()
    })

    it('no marca si es pellet', () => {
      const hit = detectSlThenRicSameDay(
        [pt(0, 'SL_INGRESO', 'san_lorenzo'), pt(120, 'INGRESO', 'ricardone')],
        { isPelletTransile: true }
      )
      expect(hit).toBeNull()
    })
  })

  describe('R3 egreso Ric → ingreso SL en banda [40 min, 6 h]', () => {
    it('marca dentro de la banda', () => {
      const hit = detectRicToSlBridgeWindow([
        pt(0, 'EGRESO', 'ricardone'),
        pt(120, 'SL_INGRESO', 'san_lorenzo'),
      ])
      expect(hit?.reason).toBe('RIC_SL_TRAMO_40M_6H')
      expect(hit?.deltaMinutes).toBe(120)
    })

    it('no marca por debajo de 40 min', () => {
      const hit = detectRicToSlBridgeWindow([
        pt(0, 'EGRESO', 'ricardone'),
        pt(30, 'SL_INGRESO', 'san_lorenzo'),
      ])
      expect(hit).toBeNull()
    })

    it('no marca por encima de 6 h', () => {
      const hit = detectRicToSlBridgeWindow([
        pt(0, 'EGRESO', 'ricardone'),
        pt(400, 'SL_INGRESO', 'san_lorenzo'),
      ])
      expect(hit).toBeNull()
    })
  })

  describe('R4 Balanza ingreso → Playa 3 → Celda 16 → (Playa 3) → Balanza', () => {
    it('marca con playa de vuelta antes de balanza', () => {
      const hit = detectBalanzaPlayaCelda16Route([
        pt(0, 'BALANZA_INGRESO'),
        pt(5, 'PLAYA'),
        pt(20, 'CELDA16_DESCARGA'),
        pt(35, 'PLAYA'),
        pt(45, 'BALANZA_EGRESO'),
      ])
      expect(hit?.reason).toBe('RUTA_BALANZA_PLAYA_C16_BALANZA')
    })

    it('marca yendo directo a balanza tras celda 16', () => {
      const hit = detectBalanzaPlayaCelda16Route([
        pt(0, 'BALANZA_INGRESO'),
        pt(5, 'PLAYA'),
        pt(20, 'CELDA16_CARGA'),
        pt(30, 'BALANZA_EGRESO'),
      ])
      expect(hit?.reason).toBe('RUTA_BALANZA_PLAYA_C16_BALANZA')
    })

    it('no marca sin celda 16', () => {
      const hit = detectBalanzaPlayaCelda16Route([
        pt(0, 'BALANZA_INGRESO'),
        pt(5, 'PLAYA'),
        pt(20, 'BALANZA_EGRESO'),
      ])
      expect(hit).toBeNull()
    })
  })

  describe('R5 punto de carga y luego plataforma de descarga', () => {
    it('marca carga en celda 16 y luego descarga en San Lorenzo', () => {
      const hit = detectLoadThenDischarge([
        pt(0, 'CELDA16_CARGA', 'ricardone'),
        pt(120, 'SL_DESCARGA', 'san_lorenzo'),
      ])
      expect(hit?.reason).toBe('CARGA_LUEGO_DESCARGA')
    })

    it('marca carga S8 y luego volcable', () => {
      const hit = detectLoadThenDischarge([
        pt(0, 'CARGA_S8', 'ricardone'),
        pt(30, 'VOLCABLE', 'ricardone'),
      ])
      expect(hit?.reason).toBe('CARGA_LUEGO_DESCARGA')
    })

    it('no marca descarga sin carga previa', () => {
      const hit = detectLoadThenDischarge([
        pt(0, 'VOLCABLE', 'ricardone'),
        pt(30, 'CELDA16_CARGA', 'ricardone'),
      ])
      expect(hit).toBeNull()
    })
  })

  describe('evaluateGoldenAnomalyRules', () => {
    it('prioriza R1 y usa platePoints para reglas de patente', () => {
      const hits = evaluateGoldenAnomalyRules({
        points: [pt(0, 'EGRESO', 'ricardone'), pt(30, 'INGRESO', 'ricardone')],
        circuitCode: 'R7',
      })
      expect(hits[0]?.reason).toBe('RIC_REINGRESO_RAPIDO_NO_PELLET')
    })

    it('pellet excluye R1/R2 pero R5 sigue disparando', () => {
      const hits = evaluateGoldenAnomalyRules({
        points: [pt(0, 'CELDA16_CARGA', 'ricardone'), pt(60, 'SL_DESCARGA', 'san_lorenzo')],
        circuitCode: 'R30',
      })
      expect(hits.some((h) => h.reason === 'RIC_REINGRESO_RAPIDO_NO_PELLET')).toBe(false)
      expect(hits.some((h) => h.reason === 'CARGA_LUEGO_DESCARGA')).toBe(true)
    })
  })

  it('umbrales documentados', () => {
    expect(GOLDEN_SL_RIC_MAX_MS).toBe(30 * 60_000)
    expect(RIC_REINGRESO_MAX_MS).toBe(60 * 60_000)
    expect(RIC_SL_MIN_MS).toBe(40 * 60_000)
    expect(RIC_SL_MAX_MS).toBe(6 * 60 * 60_000)
  })
})
