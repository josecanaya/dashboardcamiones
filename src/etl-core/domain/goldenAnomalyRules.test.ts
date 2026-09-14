import { describe, expect, it } from 'vitest'
import {
  detectRicQuickReEntry,
  detectSlThenRicReturn,
  detectRicToSlWithoutSlCalada,
  detectBalanzaPlayaCelda16Route,
  detectLoadThenDischarge,
  detectSlFlashVisit,
  detectDeclaredPlatformMismatch,
  detectRicVolcableWithoutCalada,
  evaluateGoldenAnomalyRules,
  R2_RETURN_SUBGROUP_REASONS,
  GOLDEN_SL_RIC_MAX_MS,
  RIC_REINGRESO_MAX_MS,
  SL_RIC_RETURN_MAX_MS,
  RIC_SL_NO_CALADA_MIN_MS,
  RIC_SL_NO_CALADA_MAX_MS,
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

describe('goldenAnomalyRules — reglas R1, R2, R4, R5, R6', () => {
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

  describe('R2 vuelven a Ricardone desde San Lorenzo en < 2 h (no pellet)', () => {
    it('marca retorno SL → Ric dentro de 2 h (subgrupo, no pellet)', () => {
      const hit = detectSlThenRicReturn([
        pt(0, 'SL_INGRESO', 'san_lorenzo'),
        pt(90, 'INGRESO', 'ricardone'),
      ])
      expect(R2_RETURN_SUBGROUP_REASONS).toContain(hit?.reason)
      expect(hit?.deltaMinutes).toBe(90)
    })

    it('robusto a fallo de cámara: cualquier evento en Ricardone cuenta como retorno', () => {
      const hit = detectSlThenRicReturn([
        pt(0, 'SL_EGRESO', 'san_lorenzo'),
        pt(40, 'CALADA', 'ricardone'),
      ])
      expect(R2_RETURN_SUBGROUP_REASONS).toContain(hit?.reason)
      expect(hit?.deltaMinutes).toBe(40)
    })

    it('mide desde el ÚLTIMO registro en San Lorenzo', () => {
      const hit = detectSlThenRicReturn([
        pt(0, 'SL_INGRESO', 'san_lorenzo'),
        pt(30, 'SL_EGRESO', 'san_lorenzo'),
        pt(60, 'PREINGRESO', 'ricardone'),
      ])
      // 60 - 30 = 30 min desde el último registro en SL, no desde el ingreso.
      expect(hit?.deltaMinutes).toBe(30)
    })

    it('no marca si el retorno tarda 2 h o más', () => {
      const hit = detectSlThenRicReturn([
        pt(0, 'SL_INGRESO', 'san_lorenzo'),
        pt(120, 'INGRESO', 'ricardone'),
      ])
      expect(hit).toBeNull()
    })

    it('no marca si no vuelve a Ricardone', () => {
      const hit = detectSlThenRicReturn([
        pt(0, 'SL_INGRESO', 'san_lorenzo'),
        pt(30, 'SL_EGRESO', 'san_lorenzo'),
      ])
      expect(hit).toBeNull()
    })

    it('no marca si Ricardone fue antes que San Lorenzo (no es retorno)', () => {
      const hit = detectSlThenRicReturn([
        pt(0, 'INGRESO', 'ricardone'),
        pt(30, 'SL_INGRESO', 'san_lorenzo'),
      ])
      expect(hit).toBeNull()
    })

    it('no marca si es pellet o de la vuelta', () => {
      const pts = [pt(0, 'SL_INGRESO', 'san_lorenzo'), pt(60, 'INGRESO', 'ricardone')]
      expect(detectSlThenRicReturn(pts, { isPelletTransile: true })).toBeNull()
      expect(detectSlThenRicReturn(pts, { isDeVuelta: true })).toBeNull()
    })

    it('un retorno tardío no bloquea un retorno rápido posterior', () => {
      const hit = detectSlThenRicReturn([
        pt(0, 'SL_INGRESO', 'san_lorenzo'),
        pt(200, 'INGRESO', 'ricardone'), // 3 h 20: no cuenta
        pt(260, 'SL_INGRESO', 'san_lorenzo'),
        pt(300, 'INGRESO', 'ricardone'), // 40 min: sí
      ])
      expect(R2_RETURN_SUBGROUP_REASONS).toContain(hit?.reason)
      expect(hit?.deltaMinutes).toBe(40)
    })

    describe('subgrupos (prioridad a → b → c)', () => {
      it('R2-a: San Lorenzo fue el primer destino (sin Ric antes) → ERROR_DESTINO, gana sobre b', () => {
        const hit = detectSlThenRicReturn(
          [
            pt(0, 'SL_INGRESO', 'san_lorenzo'),
            pt(40, 'INGRESO', 'ricardone'),
          ],
          { circuitCompleted: true } // aunque complete, si SL fue primero es error de destino
        )
        expect(hit?.reason).toBe('SL_RIC_2H_ERROR_DESTINO_NO_PELLET')
      })

      it('R2-b: hubo Ric antes (shuttle) y el retorno completó circuito → CICLO_COMPLETO', () => {
        const hit = detectSlThenRicReturn(
          [
            pt(0, 'INGRESO', 'ricardone'), // arrancó en Ricardone
            pt(40, 'SL_INGRESO', 'san_lorenzo'),
            pt(70, 'INGRESO', 'ricardone'), // retorno
          ],
          { circuitCompleted: true }
        )
        expect(hit?.reason).toBe('SL_RIC_2H_CICLO_COMPLETO_NO_PELLET')
      })

      it('R2-c: hubo Ric antes y el retorno NO completó circuito → SIN_CIRCUITO', () => {
        const hit = detectSlThenRicReturn([
          pt(0, 'INGRESO', 'ricardone'),
          pt(40, 'SL_INGRESO', 'san_lorenzo'),
          pt(70, 'INGRESO', 'ricardone'),
        ])
        expect(hit?.reason).toBe('SL_RIC_2H_SIN_CIRCUITO_NO_PELLET')
      })

      it('adjudica el retorno solo al journey que lo contiene (journeyPoints)', () => {
        const plate = [
          pt(0, 'INGRESO', 'ricardone'),
          pt(40, 'SL_INGRESO', 'san_lorenzo'),
          pt(70, 'INGRESO', 'ricardone'), // retorno, en el journey 2
        ]
        // El journey del viaje de ida (sin el retorno) NO debe disparar R2.
        const idaOnly = [pt(0, 'INGRESO', 'ricardone'), pt(40, 'SL_INGRESO', 'san_lorenzo')]
        expect(detectSlThenRicReturn(plate, { journeyPoints: idaOnly })).toBeNull()
        // El journey de retorno (contiene el evento de las 70') sí dispara.
        const retorno = [pt(70, 'INGRESO', 'ricardone')]
        expect(detectSlThenRicReturn(plate, { journeyPoints: retorno })?.reason).toBe(
          'SL_RIC_2H_SIN_CIRCUITO_NO_PELLET'
        )
      })
    })
  })

  describe('R6 egreso Ric → ingreso SL > 30 min y sin calado SL', () => {
    it('marca > 30 min sin paso por calado', () => {
      const hit = detectRicToSlWithoutSlCalada([
        pt(0, 'EGRESO', 'ricardone'),
        pt(45, 'SL_INGRESO', 'san_lorenzo'),
        pt(90, 'SL_EGRESO', 'san_lorenzo'),
      ])
      expect(hit?.reason).toBe('RIC_SL_MAS30M_SIN_CALADA_SL')
      expect(hit?.deltaMinutes).toBe(45)
    })

    it('no marca si el tramo es ≤ 30 min', () => {
      const hit = detectRicToSlWithoutSlCalada([
        pt(0, 'EGRESO', 'ricardone'),
        pt(30, 'SL_INGRESO', 'san_lorenzo'),
      ])
      expect(hit).toBeNull()
    })

    it('no marca por encima de 2 h', () => {
      const hit = detectRicToSlWithoutSlCalada([
        pt(0, 'EGRESO', 'ricardone'),
        pt(121, 'SL_INGRESO', 'san_lorenzo'),
      ])
      expect(hit).toBeNull()
    })

    it('no marca si pasó por calado San Lorenzo en esa visita', () => {
      const hit = detectRicToSlWithoutSlCalada([
        pt(0, 'EGRESO', 'ricardone'),
        pt(30, 'SL_INGRESO', 'san_lorenzo'),
        pt(45, 'SL_CALADA', 'san_lorenzo'),
        pt(90, 'SL_EGRESO', 'san_lorenzo'),
      ])
      expect(hit).toBeNull()
    })

    it('marca si el calado es de otra visita posterior (tras egresar del puerto)', () => {
      const hit = detectRicToSlWithoutSlCalada([
        pt(0, 'EGRESO', 'ricardone'),
        pt(45, 'SL_INGRESO', 'san_lorenzo'),
        pt(85, 'SL_EGRESO', 'san_lorenzo'),
        // Segunda visita a SL con calado: no cuenta para la primera.
        pt(200, 'SL_INGRESO', 'san_lorenzo'),
        pt(210, 'SL_CALADA', 'san_lorenzo'),
      ])
      expect(hit?.reason).toBe('RIC_SL_MAS30M_SIN_CALADA_SL')
      expect(hit?.deltaMinutes).toBe(45)
    })

    it('dispara R6 cuando el tramo Ric→SL va sin calado (R3 retirada, ya no aparece)', () => {
      const hits = evaluateGoldenAnomalyRules({
        points: [
          pt(0, 'EGRESO', 'ricardone'),
          pt(60, 'SL_INGRESO', 'san_lorenzo'),
          pt(110, 'SL_EGRESO', 'san_lorenzo'),
        ],
        circuitCode: 'R7',
      })
      expect(hits[0]?.reason).toBe('RIC_SL_MAS30M_SIN_CALADA_SL')
      expect(hits).toHaveLength(1)
    })

    it('con calado en la visita no dispara ninguna regla del tramo Ric→SL', () => {
      const hits = evaluateGoldenAnomalyRules({
        points: [
          pt(0, 'EGRESO', 'ricardone'),
          pt(60, 'SL_INGRESO', 'san_lorenzo'),
          pt(75, 'SL_CALADA', 'san_lorenzo'),
          pt(120, 'SL_EGRESO', 'san_lorenzo'),
        ],
        circuitCode: 'R7',
      })
      expect(hits.some((h) => h.reason === 'RIC_SL_MAS30M_SIN_CALADA_SL')).toBe(false)
      expect(hits).toHaveLength(0)
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

    it('R2 gana sobre R1 en un Ric → SL → Ric (retorno desde el puerto)', () => {
      const hits = evaluateGoldenAnomalyRules({
        points: [
          pt(0, 'EGRESO', 'ricardone'),
          pt(20, 'SL_INGRESO', 'san_lorenzo'),
          pt(50, 'INGRESO', 'ricardone'),
        ],
        circuitCode: 'R7',
      })
      expect(R2_RETURN_SUBGROUP_REASONS).toContain(hits[0]?.reason)
    })

    it('pellet excluye R1 pero R5 sigue disparando', () => {
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
    expect(SL_RIC_RETURN_MAX_MS).toBe(2 * 60 * 60_000)
    expect(RIC_SL_NO_CALADA_MIN_MS).toBe(30 * 60_000)
    expect(RIC_SL_NO_CALADA_MAX_MS).toBe(2 * 60 * 60_000)
  })
})

// ————————————————————————————————————————————————————————————————
// R9 / R11 (2026-09-09): reglas elegidas por tipo de evidencia.
// ————————————————————————————————————————————————————————————————

describe('R9 · visita relámpago al puerto', () => {
  it('marca entrada y salida de San Lorenzo en menos de 30 min sin operar', () => {
    const hit = detectSlFlashVisit([
      pt(0, 'SL_INGRESO', 'san_lorenzo'),
      pt(22, 'SL_EGRESO', 'san_lorenzo'),
    ])
    expect(hit?.reason).toBe('SL_VISITA_RELAMPAGO_SIN_OPERAR')
    expect(hit?.deltaMinutes).toBe(22)
  })

  it('no marca si pasó por volcable: operó de verdad', () => {
    expect(
      detectSlFlashVisit([
        pt(0, 'SL_INGRESO', 'san_lorenzo'),
        pt(10, 'SL_VOLCABLE', 'san_lorenzo'),
        pt(20, 'SL_EGRESO', 'san_lorenzo'),
      ])
    ).toBeNull()
  })

  it('no marca si pasó por la balanza de salida', () => {
    expect(
      detectSlFlashVisit([
        pt(0, 'SL_INGRESO', 'san_lorenzo'),
        pt(15, 'SL_BALANZA_SALIDA', 'san_lorenzo'),
        pt(20, 'SL_EGRESO', 'san_lorenzo'),
      ])
    ).toBeNull()
  })

  it('no marca una permanencia normal en el puerto', () => {
    expect(
      detectSlFlashVisit([
        pt(0, 'SL_INGRESO', 'san_lorenzo'),
        pt(120, 'SL_EGRESO', 'san_lorenzo'),
      ])
    ).toBeNull()
  })
})

describe('R11 · descarga en calle distinta a la declarada', () => {
  const mov = (platform: string) => ({ platform, fromMs: t0, toMs: t0 + 3 * 3_600_000 })
  const volcable = (offsetMin: number, deviceCode: string) => ({
    ...pt(offsetMin, 'SL_VOLCABLE', 'san_lorenzo'),
    deviceCode,
  })

  it('marca cuando el Excel declara una calle y la cámara registra otra', () => {
    const hit = detectDeclaredPlatformMismatch([volcable(60, 'SLZVolcableC2')], [mov('VOLCABLE_PTO_5')])
    expect(hit?.reason).toBe('PLATAFORMA_DISTINTA_A_DECLARADA')
    expect(hit?.detail).toContain('volcable 5')
    expect(hit?.detail).toContain('volcable 2')
  })

  it('no marca cuando coinciden', () => {
    expect(
      detectDeclaredPlatformMismatch([volcable(60, 'SLZVolcableC3')], [mov('VOLCABLE_PTO_3')])
    ).toBeNull()
  })

  it('no marca sin movimiento del Excel: una fuente sola no contradice a nadie', () => {
    expect(detectDeclaredPlatformMismatch([volcable(60, 'SLZVolcableC3')], [])).toBeNull()
    expect(detectDeclaredPlatformMismatch([volcable(60, 'SLZVolcableC3')], undefined)).toBeNull()
  })

  it('no marca cuando el evento cae fuera de la ventana del movimiento declarado', () => {
    expect(
      detectDeclaredPlatformMismatch([volcable(24 * 60, 'SLZVolcableC2')], [mov('VOLCABLE_PTO_5')])
    ).toBeNull()
  })

  it('no marca si alguna de las calles observadas es la declarada (cámaras contiguas)', () => {
    expect(
      detectDeclaredPlatformMismatch(
        [volcable(60, 'SLZVolcableC4'), volcable(64, 'SLZVolcableC5')],
        [mov('VOLCABLE_PTO_5')]
      )
    ).toBeNull()
  })

  it('marca cuando ninguna de las calles observadas es la declarada', () => {
    const hit = detectDeclaredPlatformMismatch(
      [volcable(60, 'SLZVolcableC1'), volcable(64, 'SLZVolcableC2')],
      [mov('VOLCABLE_PTO_5')]
    )
    expect(hit?.reason).toBe('PLATAFORMA_DISTINTA_A_DECLARADA')
    expect(hit?.detail).toContain('1 y 2')
  })

  it('ignora plataformas sin cámara por calle: no hay con qué comparar', () => {
    expect(
      detectDeclaredPlatformMismatch([volcable(60, 'SLZVolcableC2')], [mov('KEPPLER_1')])
    ).toBeNull()
  })
})

describe('R12 · volcable Ricardone sin calado en cámara ni en Excel', () => {
  const visita = (conCalada: boolean) => [
    pt(0, 'INGRESO', 'ricardone'),
    ...(conCalada ? [pt(20, 'CALADA', 'ricardone')] : []),
    pt(40, 'BALANZA_INGRESO', 'ricardone'),
    pt(60, 'VOLCABLE', 'ricardone'),
    pt(90, 'EGRESO', 'ricardone'),
  ]

  it('marca cuando no hay calado en la cámara ni hora de calado en el Excel', () => {
    const hit = detectRicVolcableWithoutCalada(visita(false), [])
    expect(hit?.reason).toBe('VOLCABLE_SIN_CALADA_RIC')
  })

  it('no marca si la cámara registró el calado', () => {
    expect(detectRicVolcableWithoutCalada(visita(true), [])).toBeNull()
  })

  it('no marca si el Excel trae la hora de calado: la cámara falló, no el camión', () => {
    const caladoMs = t0 + 25 * 60_000
    expect(detectRicVolcableWithoutCalada(visita(false), [{ caladoMs }])).toBeNull()
  })

  it('no marca sin descarga por volcable', () => {
    const sinVolcable = [pt(0, 'INGRESO', 'ricardone'), pt(90, 'EGRESO', 'ricardone')]
    expect(detectRicVolcableWithoutCalada(sinVolcable, [])).toBeNull()
  })
})
