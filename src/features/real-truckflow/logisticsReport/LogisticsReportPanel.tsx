/**
 * Estado de la exportación del informe de logística.
 *
 * Muestra dónde quedó el Excel del período y qué indicadores no se pudieron conectar. Un
 * fallo acá no invalida el procesamiento: se ve el error y el resto del dashboard sigue
 * mostrando su resultado.
 */
import { useState } from 'react'
import { useLogisticsReportExport } from './useLogisticsReportExport'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold tabular-nums text-slate-800">{value}</span>
    </div>
  )
}

export function LogisticsReportPanel() {
  const exp = useLogisticsReportExport()
  const [showPendientes, setShowPendientes] = useState(false)

  if (exp.status === 'idle') return null

  const periodo = exp.periodo ? `${exp.periodo.from} → ${exp.periodo.to}` : '—'
  // Se rotula de dónde sale el período para que no se confunda con el del formulario de
  // arriba: ese se puede cambiar sin recargar datos, y el informe usa el de los datos.
  const fuentePeriodo =
    exp.periodo?.source === 'rango_compuesto' ? 'rango compuesto' : 'período cargado'

  return (
    <div className="rounded-3xl border border-slate-200 bg-white px-7 py-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
          Informe de logística · Excel del período
        </h3>
        <span className="text-xs text-slate-400">
          {periodo} <span className="text-slate-300">·</span> {fuentePeriodo}
        </span>
      </div>
      <p className="mt-1 text-[11.5px] text-slate-500">
        Se exporta el período de los datos cargados, no el del formulario de arriba.
      </p>

      {exp.status === 'running' ? (
        <p className="mt-3 text-[13px] text-slate-500">Generando el Excel del informe…</p>
      ) : null}

      {exp.status === 'error' ? (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-[13px] font-semibold text-amber-900">
            No se pudo generar el Excel del informe.
          </p>
          <p className="mt-1 text-[12px] text-amber-800">{exp.error}</p>
          <p className="mt-1 text-[12px] text-amber-700">
            El procesamiento del período sigue siendo válido: solo falló la exportación.
          </p>
          <button
            type="button"
            onClick={() => void exp.exportNow()}
            className="mt-2 rounded-lg bg-amber-700 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-amber-800"
          >
            Reintentar exportación
          </button>
        </div>
      ) : null}

      {exp.status === 'done' && exp.result ? (
        <div className="mt-3 space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Archivo generado · revisión {exp.result.revision}
            </div>
            <code className="mt-1 block break-all text-[11.5px] text-slate-700">
              {exp.result.xlsxPath}
            </code>
          </div>

          <div className="space-y-1">
            <Row
              label="Gráficos completados"
              value={`${exp.result.cobertura.graficos.completados} / ${exp.result.cobertura.graficos.total}`}
            />
            <Row
              label="Series históricas conservadas"
              value={String(exp.result.cobertura.graficos.conservadosHistoricos)}
            />
            <Row
              label="Gráficos pendientes"
              value={String(exp.result.cobertura.graficos.pendientes)}
            />
            <Row
              label="Textos conectados"
              value={`${exp.result.cobertura.textos.conectados} (${exp.result.cobertura.textos.estaticos} rótulos estáticos)`}
            />
          </div>

          {exp.result.pendientes.length ? (
            <div>
              <button
                type="button"
                onClick={() => setShowPendientes((v) => !v)}
                className="text-[12px] font-bold text-violet-700 hover:underline"
              >
                {showPendientes ? 'Ocultar' : 'Ver'} {exp.result.pendientes.length} indicadores
                pendientes
              </button>
              {showPendientes ? (
                <ul className="mt-2 space-y-1 text-[12px] text-slate-600">
                  {exp.result.pendientes.map((p) => (
                    <li key={p.id} className="flex gap-2">
                      <span className="font-mono font-semibold text-slate-700">{p.id}</span>
                      <span>— {p.reason}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <p className="text-[11.5px] text-slate-500">
            El informe queda para tu revisión. Las capturas de actividad de calada y volcables
            siguen como espacios vacíos para carga manual.
          </p>

          <button
            type="button"
            onClick={() => void exp.exportNow()}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-[12px] font-bold text-slate-700 hover:bg-slate-200"
          >
            Rehacer exportación
          </button>
        </div>
      ) : null}
    </div>
  )
}
