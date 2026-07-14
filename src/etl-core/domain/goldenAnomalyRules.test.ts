import { describe, expect, it } from 'vitest'
import {
  detectCaladaToPreingresoRegression,
  detectRicToSlTravelTooSlow,
  detectSkippedPointWithExtremeGap,
  detectSlRicQuickReturnNoPellet,
  evaluateGoldenAnomalyRules,
  GOLDEN_CALADA_PREINGRESO_MAX_MS,
  GOLDEN_RIC_SL_MIN_MS,
  GOLDEN_SKIP_GAP_MAX_MS,
  GOLDEN_SL_RIC_MAX_MS,
  type GoldenTimelinePoint,
} from './goldenAnomalyRules'

const t0 = Date.parse('2026-07-10T10:00:00-03:00')

function pt(
  offsetMin: number,
  logicalCode: string,
  siteId?: string
): GoldenTimelinePoint {
  return { t: t0 + offsetMin * 60_000, logicalCode, siteId }
}

describe('goldenAnomalyRules', () => {
  describe('G1 SL→Ric ≤30 sin pellet', () => {
    it('marca vuelta rápida no pellet', () => {
      const hit = detectSlRicQuickReturnNoPellet([
        pt(0, 'SL_EGRESO', 'san_lorenzo'),
        pt(25, 'INGRESO', 'ricardone'),
      ])
      expect(hit?.reason).toBe('SL_RIC_VUELTA_RAPIDA_NO_PELLET')
      expect(hit?.deltaMinutes).toBe(25)
    })

    it('no marca si es pellet', () => {
      const hit = detectSlRicQuickReturnNoPellet(
        [pt(0, 'SL_EGRESO', 'san_lorenzo'), pt(20, 'PREINGRESO', 'ricardone')],
        { isPelletTransile: true }
      )
      expect(hit).toBeNull()
    })

    it('no marca si supera 30 min', () => {
      const hit = detectSlRicQuickReturnNoPellet([
        pt(0, 'SL_EGRESO', 'san_lorenzo'),
        pt(31, 'INGRESO', 'ricardone'),
      ])
      expect(hit).toBeNull()
    })
  })

  describe('G2 Calada→Preingreso <20', () => {
    it('detecta regresión corta', () => {
      const hit = detectCaladaToPreingresoRegression([
        pt(0, 'PREINGRESO'),
        pt(10, 'CALADA'),
        pt(25, 'PREINGRESO'),
      ])
      expect(hit?.reason).toBe('REGRESION_CALADA_PREINGRESO')
      expect(hit?.deltaMinutes).toBe(15)
    })

    it('ignora si ≥20 min', () => {
      const hit = detectCaladaToPreingresoRegression([
        pt(0, 'CALADA'),
        pt(20, 'PREINGRESO'),
      ])
      expect(hit).toBeNull()
    })

    it('no confunde recalado PREINGRESO→CALADA', () => {
      const hit = detectCaladaToPreingresoRegression([
        pt(0, 'PREINGRESO'),
        pt(5, 'CALADA'),
        pt(40, 'PREINGRESO'),
        pt(50, 'CALADA'),
      ])
      expect(hit).toBeNull()
    })
  })

  describe('G3 skip + lapso extremo', () => {
    const expected = ['INGRESO', 'PREINGRESO', 'CALADA', 'EGRESO'] as const
    it('marca gap extremo con punto faltante', () => {
      const hit = detectSkippedPointWithExtremeGap(
        [pt(0, 'INGRESO'), pt(300, 'EGRESO')],
        expected,
        ['PREINGRESO', 'CALADA']
      )
      expect(hit?.reason).toBe('SKIP_PUNTO_LAPSO_EXTREMO')
      expect(hit!.deltaMinutes!).toBeGreaterThan(roundMin(GOLDEN_SKIP_GAP_MAX_MS))
    })

    it('no marca gap corto aunque falte punto', () => {
      const hit = detectSkippedPointWithExtremeGap(
        [pt(0, 'INGRESO'), pt(60, 'EGRESO')],
        expected,
        ['PREINGRESO', 'CALADA']
      )
      expect(hit).toBeNull()
    })
  })

  describe('G4 Ric→SL >30', () => {
    it('marca demora', () => {
      const hit = detectRicToSlTravelTooSlow([
        pt(0, 'EGRESO', 'ricardone'),
        pt(45, 'SL_INGRESO', 'san_lorenzo'),
      ])
      expect(hit?.reason).toBe('RIC_SL_DEMORA')
      expect(hit?.deltaMinutes).toBe(45)
    })

    it('no marca si ≤30', () => {
      const hit = detectRicToSlTravelTooSlow([
        pt(0, 'EGRESO', 'ricardone'),
        pt(30, 'SL_INGRESO', 'san_lorenzo'),
      ])
      expect(hit).toBeNull()
    })
  })

  describe('evaluateGoldenAnomalyRules', () => {
    it('prioriza G1 cuando hay varias', () => {
      const hits = evaluateGoldenAnomalyRules({
        points: [
          pt(0, 'SL_EGRESO', 'san_lorenzo'),
          pt(10, 'INGRESO', 'ricardone'),
          pt(15, 'CALADA', 'ricardone'),
          pt(20, 'PREINGRESO', 'ricardone'),
        ],
        circuitCode: 'R7',
      })
      expect(hits[0]?.reason).toBe('SL_RIC_VUELTA_RAPIDA_NO_PELLET')
      expect(hits.some((h) => h.reason === 'REGRESION_CALADA_PREINGRESO')).toBe(true)
    })

    it('pellet circuit excluye G1', () => {
      const hits = evaluateGoldenAnomalyRules({
        points: [pt(0, 'SL_EGRESO', 'san_lorenzo'), pt(10, 'INGRESO', 'ricardone')],
        circuitCode: 'R30',
      })
      expect(hits.some((h) => h.reason === 'SL_RIC_VUELTA_RAPIDA_NO_PELLET')).toBe(false)
    })
  })

  it('umbrales documentados', () => {
    expect(GOLDEN_SL_RIC_MAX_MS).toBe(30 * 60_000)
    expect(GOLDEN_CALADA_PREINGRESO_MAX_MS).toBe(20 * 60_000)
    expect(GOLDEN_SKIP_GAP_MAX_MS).toBe(240 * 60_000)
    expect(GOLDEN_RIC_SL_MIN_MS).toBe(30 * 60_000)
  })
})

function roundMin(ms: number): number {
  return Math.round((ms / 60000) * 10) / 10
}
