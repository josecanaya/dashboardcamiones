import { useState, type ReactNode } from 'react'
import type { AttributeComparison, CandidateEvidence, IdentificationCandidate } from '../../services/live/plantStateApi'
import './candidateOdds.css'

export type OddsCandidate = IdentificationCandidate & Partial<CandidateEvidence>

/**
 * Una evidencia del candidato. `strength` es cuánto empuja a favor (+) o en contra (−), en escala
 * logarítmica acotada a ±2 (el algoritmo multiplica razones de verosimilitud; acá se suman sus logaritmos).
 */
export type Factor = { key: string; short: string; label: string; value: string; strength: number; hint?: string }

const pct = (n: number) => `${Math.round(n * 100)}%`
const clamp = (v: number) => Math.max(-2, Math.min(2, v))
// Valores del DSS que llegan en inglés.
const ES: Record<string, string> = { white: 'blanco', black: 'negro', red: 'rojo', blue: 'azul', green: 'verde', gray: 'gris', grey: 'gris', silver: 'plateado', yellow: 'amarillo', orange: 'naranja', brown: 'marrón', 'large truck': 'camión grande', 'medium truck': 'camión mediano', 'small truck': 'camión chico', suv: 'SUV', bus: 'colectivo', car: 'auto', van: 'furgón', pickup: 'camioneta', sedan: 'auto' }
export const esValue = (v?: string | null) => (v ? ES[v.toLowerCase()] ?? v : 'sin dato')
const ATTR: Record<AttributeComparison['kind'], [string, string]> = { color: ['Color', 'Col'], marca: ['Marca', 'Mar'], tipo: ['Tipo', 'Tipo'] }

/** Evidencias en el orden en que pesan: patente, paso esperado (modelo de nodos), color, marca y tipo (DSS). */
export function candidateFactors(c: OddsCandidate): Factor[] {
  const out: Factor[] = []
  out.push({
    key: 'patente',
    short: 'Pat',
    label: 'Patente',
    value: `${pct(c.similarity)} parecida`,
    strength: clamp((c.similarity - 0.75) * 8),
    hint: 'Caracteres que coinciden, contando las confusiones típicas de la cámara (0/O, 8/B, 1/I…).',
  })
  const node = c.lastNodeLabel ?? c.lastNode ?? ''
  const before = c.circuitBefore && c.circuitBefore !== c.circuit ? `; venía haciendo ${c.circuitBefore}` : ''
  if (c.seenAfter) {
    out.push({ key: 'paso', short: 'Paso', label: 'Referencia posterior', value: 'solo revisión humana', strength: 0, hint: 'Esta lectura no existía al producirse la captura: no habilita corrección automática.' })
  } else if (c.twin) {
    const s = c.twinSeconds ?? 0
    out.push({ key: 'paso', short: 'Paso', label: 'Doble lectura', value: `leído en este nodo a ${s < 60 ? `${s} s` : `${Math.round(s / 60)} min`}`, strength: 2, hint: 'Hay una lectura cercana en este punto. Las cámaras pueden ver vehículos distintos; verificá ambas fotos.' })
  } else if (c.sameNode) out.push({ key: 'paso', short: 'Paso', label: 'Paso', value: 'ya estaba en este punto', strength: 1.5 })
  else if (!c.circuit) out.push({ key: 'paso', short: 'Paso', label: 'Paso', value: 'ningún circuito pasa por acá', strength: Math.log(0.3), hint: `Último paso: ${node}` })
  else if (c.nodeProbability >= 0.05) out.push({ key: 'paso', short: 'Paso', label: 'Paso esperado', value: `${c.circuit} · ${pct(c.nodeProbability)}`, strength: clamp(0.4 + c.nodeProbability), hint: `Viene de ${node}${before}` })
  else out.push({ key: 'paso', short: 'Paso', label: 'Paso', value: `no esperado (${c.circuit})`, strength: Math.log(0.7), hint: `Viene de ${node}; puede faltar una cámara intermedia${before}` })
  if (!c.twin && !c.sameNode && c.gapMinutes != null && c.typicalMinutes != null) {
    out.push({
      key: 'tiempo',
      short: 'Hora',
      label: 'Tiempo',
      value: `${c.gapMinutes} min (habitual ${c.typicalMinutes})`,
      strength: c.onTime === false ? -1.5 : 0.4,
      hint: c.onTime === false ? `Tarda más de lo posible para ese tramo (máx. ${c.maxMinutes} min): no estaría llegando ahora` : 'A tiempo de estar llegando a este punto',
    })
  }
  for (const kind of ['color', 'marca', 'tipo'] as const) {
    const cmp = c.comparisons?.find((x) => x.kind === kind)
    if (!cmp) continue
    const [label, short] = ATTR[kind]
    out.push({
      key: kind,
      short,
      label,
      value: cmp.result === 'sin_dato' ? 'sin dato' : cmp.result === 'coincide' ? esValue(cmp.candidate) : `${esValue(cmp.read)} ≠ ${esValue(cmp.candidate)}`,
      strength: cmp.result === 'sin_dato' ? 0 : clamp(Math.log(cmp.lr)),
      hint: `Lectura: ${esValue(cmp.read)} · candidato: ${esValue(cmp.candidate)}`,
    })
  }
  return out
}

/** Fichas de evidencia (texto): verde a favor, rojo en contra, gris sin dato. */
export function FactorChips({ factors, size = 'md' }: { factors: Factor[]; size?: 'md' | 'sm' }) {
  return (
    <ul className={`co-factors co-factors--${size}`}>
      {factors.map((f) => {
        const w = Math.abs(f.strength) >= 1 ? 2 : f.strength === 0 ? 0 : 1
        return (
          <li key={f.key} className={f.strength > 0.05 ? 'is-pro' : f.strength < -0.05 ? 'is-con' : 'is-none'} title={f.hint}>
            <span className="co-arrows">{f.strength > 0.05 ? '▲'.repeat(w) : f.strength < -0.05 ? '▼'.repeat(w) : '–'}</span>
            <b>{f.label}</b> {f.value}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Minigráfico de evidencia: una columna por factor que sube (verde) si favorece al candidato
 * y baja (rojo) si lo contradice; la altura es cuánto pesa.
 */
export function EvidenceSpark({ factors, emphasis = false }: { factors: Factor[]; emphasis?: boolean }) {
  const colW = emphasis ? 34 : 28
  const half = emphasis ? 26 : 18
  const h = half * 2 + 14
  const w = factors.length * colW
  return (
    <svg className={`co-spark${emphasis ? ' is-big' : ''}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={factors.map((f) => `${f.label} ${f.value}`).join(', ')}>
      <line x1={0} x2={w} y1={half} y2={half} className="co-spark__axis" />
      {factors.map((f, i) => {
        // Raíz para que las evidencias chicas también se vean; mínimo 5 px.
        const len = Math.max(5, Math.sqrt(Math.abs(f.strength) / 2) * (half - 2))
        const x = i * colW + colW * 0.2
        const bw = colW * 0.6
        const pro = f.strength > 0.05
        const con = f.strength < -0.05
        return (
          <g key={f.key}>
            <title>{`${f.label}: ${f.value}${f.hint ? ` — ${f.hint}` : ''}`}</title>
            {pro || con ? (
              <rect x={x} width={bw} y={pro ? half - len : half} height={Math.max(len, 2)} rx={2} className={pro ? 'co-spark__pro' : 'co-spark__con'} />
            ) : (
              <circle cx={x + bw / 2} cy={half} r={2.5} className="co-spark__none" />
            )}
            <text x={x + bw / 2} y={h - 2} textAnchor="middle" className="co-spark__label">{f.short}</text>
          </g>
        )
      })}
    </svg>
  )
}

export type Option =
  | { kind: 'candidate'; id: string; plate: string; probability: number | null; candidate: OddsCandidate }
  | { kind: 'own'; id: string; plate: string; probability: number | null }

/** Todas las hipótesis (candidatos + «la lectura está bien / ninguno») ordenadas por probabilidad. */
export function rankOptions(candidates: OddsCandidate[], otherProbability: number | null): Option[] {
  const opts: Option[] = candidates.map((c) => ({ kind: 'candidate', id: c.plate, plate: c.plate, probability: c.probability ?? null, candidate: c }))
  if (otherProbability != null) opts.push({ kind: 'own', id: '__own__', plate: '', probability: otherProbability })
  const key = (o: Option) => o.probability ?? (o.kind === 'candidate' ? o.candidate.score / 100 : -1)
  return opts.sort((a, b) => key(b) - key(a))
}

export const ownTitle = (_readPlate: string, _validFormat: boolean) => 'Ningún candidato listado'
const ownShort = (_readPlate: string, _validFormat: boolean) => 'Ninguno'
const ownSubtitle = (validFormat: boolean) =>
  validFormat ? 'Vehículo que no está entre los camiones en planta, o patente correcta tal cual.' : 'Otro camión o lectura irrecuperable: escribí la patente o posponé el caso.'

const GREYS = ['#8fa69a', '#b3c3b9', '#cbd6cf', '#dde5e0']

/** Anillo con el reparto de probabilidad; la opción más fuerte siempre en verde y al centro. */
export function OddsDonut({ options, readPlate, validFormat, size = 150, selected }: { options: Option[]; readPlate: string; validFormat: boolean; size?: number; selected?: string }) {
  const known = options.filter((o) => o.probability != null)
  const r = size / 2 - 12
  const c = 2 * Math.PI * r
  const top = options[0]
  let acc = 0
  return (
    <svg className="co-donut" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={known.map((o) => `${o.kind === 'own' ? ownTitle(readPlate, validFormat) : o.plate} ${pct(o.probability!)}`).join(', ')}>
      <defs>
        <pattern id="co-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#1d7a4f" />
          <rect width="3" height="6" fill="#2fa36c" />
        </pattern>
        <pattern id="co-hatch-grey" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#c3cfc8" />
          <rect width="3" height="6" fill="#dbe3de" />
        </pattern>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} className="co-donut__track" />
      {known.map((o, i) => {
        const p = o.probability!
        const len = Math.max(0, p * c - (known.length > 1 ? 2 : 0))
        const fill = i === 0 ? (o.kind === 'own' ? 'url(#co-hatch)' : '#1d7a4f') : o.kind === 'own' ? 'url(#co-hatch-grey)' : GREYS[Math.min(i - 1, GREYS.length - 1)]
        const el = (
          <circle
            key={o.id}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={fill}
            strokeWidth={i === 0 ? 20 : 14}
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-acc}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className={selected === o.id ? 'is-selected' : ''}
          >
            <title>{`${o.kind === 'own' ? ownTitle(readPlate, validFormat) : o.plate}: ${pct(p)}`}</title>
          </circle>
        )
        acc += p * c
        return el
      })}
      <text x="50%" y="46%" textAnchor="middle" className="co-donut__pct">{top?.probability != null ? pct(top.probability) : '…'}</text>
      <text x="50%" y="62%" textAnchor="middle" className="co-donut__name">{top ? (top.kind === 'own' ? ownShort(readPlate, validFormat) : top.plate) : ''}</text>
    </svg>
  )
}

/**
 * Hipótesis de una lectura dudosa: anillo con el reparto y, por opción, su barra de probabilidad y
 * el minigráfico de evidencia. Peso visual según probabilidad; la más fuerte siempre en verde,
 * aunque sea «la cámara leyó bien».
 */
export function CandidateOdds({
  readPlate,
  validFormat,
  options,
  pending,
  renderActions,
  renderExtra,
}: {
  readPlate: string
  validFormat: boolean
  options: Option[]
  /** La probabilidad todavía no está (esperando el DSS): se ordena por puntaje. */
  pending: boolean
  renderActions: (o: Option, top: boolean) => ReactNode
  renderExtra?: (o: Option) => ReactNode
}) {
  const [showExceptions, setShowExceptions] = useState(false)
  if (!options.length) return null
  const [top, second] = options
  const margin = top.probability != null && second?.probability != null ? top.probability - second.probability : null
  const close = margin != null && margin < 0.15
  const name = (o: Option) => (o.kind === 'own' ? ownShort(readPlate, validFormat) : o.plate)

  return (
    <div className="co">
      <div className="co-hero">
        {pending ? <div className="co-donut co-donut--pending">Calculando…</div> : <OddsDonut options={options} readPlate={readPlate} validFormat={validFormat} />}
        <div className="co-hero__text">
          <span className="co-kicker">¿De quién es esta lectura?</span>
          <h4>
            {top.kind === 'own' ? 'Ningún candidato listado' : <>Mayor apoyo del modelo{top.candidate.inUniverse!==true ? ' · excepción, verificar fotos' : ''}: <span className="co-plate">{top.plate}</span></>}
          </h4>
          <p>
            {pending
              ? 'Ordenado por patente y recorrido mientras llegan color, marca y tipo del DSS.'
              : top.kind === 'own'
                ? ownSubtitle(validFormat)
                : whereText(top.candidate)}
          </p>
          {close && second ? (
            <p className="co-close">Parejo: le saca solo {Math.round(margin! * 100)} puntos a {name(second)}. Compará las dos fotos.</p>
          ) : margin != null && second ? (
            <p className="co-margin">Le saca {Math.round(margin * 100)} puntos a la segunda opción.</p>
          ) : null}
        </div>
        {!pending ? (
          <ul className="co-key-list" aria-hidden="true">
            {options.filter((o) => o.probability != null).map((o, i) => (
              <li key={o.id} className={i === 0 ? 'is-top' : ''}>
                <span className={`co-dot${o.kind === 'own' ? ' is-own' : ''}`} style={i === 0 || o.kind === 'own' ? undefined : { background: GREYS[Math.min(i - 1, GREYS.length - 1)] }} />
                <span className={o.kind === 'own' ? '' : 'co-plate'}>{o.kind === 'own' ? 'Ninguno' : o.plate}</span>
                <b>{pct(o.probability!)}</b>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <p className="co-legend"><b>Esperados en este punto</b> · visita vigente y paso pendiente. Los porcentajes siguen comparando todas las opciones.</p>
      <ol className="co-list">
        {[...options.filter(o=>o.kind==='own' || o.candidate.inUniverse===true), ...(showExceptions ? options.filter(o=>o.kind==='candidate' && o.candidate.inUniverse!==true) : [])].map((o) => {
          const i=options.indexOf(o)
          const p = o.probability
          const isTop = i === 0
          const factors = o.kind === 'candidate' ? candidateFactors(o.candidate) : null
          // Peso visual: la letra y la barra crecen con la probabilidad.
          const fs = 14 + Math.round(14 * (p ?? (isTop ? 0.5 : 0.1)))
          return (
            <li key={o.id} className={`${isTop ? 'is-top' : ''}${o.kind === 'own' ? ' is-own' : ''}${p != null && p < 0.05 ? ' is-faint' : ''}`}>
              <div className="co-line">
                <span className="co-rank">{isTop ? '★' : i + 1}</span>
                <div className="co-who">
                  <span className={o.kind === 'own' ? 'co-name' : 'co-name co-plate'} style={{ fontSize: fs }}>
                    {name(o)}
                  </span>
                  <small>{o.kind === 'own' ? 'lectura correcta u otro vehículo sin candidato' : whereText(o.candidate)}</small>
                </div>
                <div className="co-meter" aria-hidden="true">
                  <span style={{ width: p != null ? `${Math.max(1.5, p * 100)}%` : '0%' }} />
                </div>
                <span className="co-pct">{p != null ? pct(p) : '…'}</span>
                {factors ? <EvidenceSpark factors={factors} emphasis={isTop} /> : <span className="co-spark-own" aria-hidden="true">sin camión que coincida</span>}
                <span className="co-actions">{renderActions(o, isTop)}</span>
              </div>
              {isTop && factors ? <FactorChips factors={factors} /> : null}
              {renderExtra?.(o)}
            </li>
          )
        })}
      </ol>
      {options.some(o=>o.kind==='candidate' && o.candidate.inUniverse!==true) ? <button type="button" className="co-btn" aria-expanded={showExceptions} onClick={()=>setShowExceptions(v=>!v)}>{showExceptions ? 'Ocultar excepciones' : `Ver excepciones (${options.filter(o=>o.kind==='candidate' && o.candidate.inUniverse!==true).length}) · solo revisión humana`}</button> : null}
      {!options.some(o=>o.kind==='candidate' && o.candidate.inUniverse===true) ? <p className="co-legend">No hay un camión conocido esperando este paso. Abrí las excepciones, escribí la patente o posponé.</p> : null}
      <p className="co-legend">
        Porcentajes de apoyo relativo entre las opciones evaluadas; no son una tasa de acierto certificada.{' '}
        <span className="co-key co-key--pro" /> a favor <span className="co-key co-key--con" /> en contra · columnas: patente, paso esperado, hora de llegada, color, marca y tipo (los atributos los detecta la cámara y pueden fallar)
      </p>
    </div>
  )
}

function whereText(c: OddsCandidate) {
  const node = c.lastNodeLabel ?? c.lastNode ?? ''
  const at = c.lastSeenAt ? new Date(c.lastSeenAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' }) : ''
  // Fuera del universo: en planta pero este nodo no es un paso probable para él (nunca se aplica solo).
  // Excepción del inventario por visita: se muestra el motivo. Las reglas en evaluación no bloquean, solo se avisan.
  const outside = c.inUniverse === false
    ? ` · ${c.inventory?.status === 'exception' ? c.inventory.reason.toLowerCase() : 'fuera del universo'}`
    : c.inventory?.shadow ? ` · en evaluación: ${c.inventory.shadow.reason.toLowerCase()}` : ''
  if (c.where === 'leido_despues') return `leído bien después en ${node} ${at}${outside}`
  if (c.where === 'otra_planta') return `en la otra planta (${node} ${at})${outside}`
  return `en planta · último paso ${node} ${at}${outside}`
}
