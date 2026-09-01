import { useState } from 'react'
import { useEtlWorkbenchOptional } from '../etlWorkbench/EtlWorkbenchContext'
import { CaladaCamerasPanel } from './CaladaCamerasPanel'

export function DescargasTab() {
  const wb = useEtlWorkbenchOptional()
  const tr = wb?.transformResult

  const [tab, setTab] = useState<'ricardone' | 'san-lorenzo'>('ricardone')

  const periodLabel = wb?.loadSummary?.daysDetected
    ? wb.loadSummary.daysDetected.length === 1
      ? wb.loadSummary.daysDetected[0]
      : `${wb.loadSummary.daysDetected[0]} → ${wb.loadSummary.daysDetected[wb.loadSummary.daysDetected.length - 1]}`
    : '—'

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setTab('ricardone')}
          className={`px-4 py-2 font-semibold transition ${
            tab === 'ricardone'
              ? 'border-b-2 border-violet-600 text-violet-900'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Ricardone
        </button>
        <button
          onClick={() => setTab('san-lorenzo')}
          className={`px-4 py-2 font-semibold transition ${
            tab === 'san-lorenzo'
              ? 'border-b-2 border-violet-600 text-violet-900'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          San Lorenzo
        </button>
      </div>

      {tab === 'ricardone' && (
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-slate-900 mb-2">Volcables 1–2</h3>
            <p className="text-sm text-slate-600 mb-3">
              Actividad por volcable en Ricardone (cámaras RicC16CargaX)
            </p>
            <CaladaCamerasPanel
              csv={tr?.csv.volcables_ricardone_events}
              checkedCircuits={new Set()}
              filterActive={false}
              periodLabel={periodLabel}
              labels={{
                entitySingular: 'volcable Ric',
                entityPlural: 'volcables Ric',
                columnHeader: 'Volcable Ric',
                trucksMetric: 'Camiones en volcables',
                activityMetric: 'Volcables con actividad',
                exportName: 'ricardone_volcables',
                tableName: 'volcables_ricardone_events',
              }}
            />
          </div>

          <div>
            <h3 className="font-semibold text-slate-900 mb-2">Silos (5 líneas de carga)</h3>
            <p className="text-sm text-slate-600 mb-3">
              Actividad por línea de carga en Silos (2 volcables + 3 carga)
            </p>
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Silos: tabla en construcción (silos_ricardone_events por implementar)
            </p>
          </div>
        </div>
      )}

      {tab === 'san-lorenzo' && (
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-slate-900 mb-2">Volcables 1–5 (Puerto)</h3>
            <p className="text-sm text-slate-600 mb-3">
              Actividad por volcable en San Lorenzo (Excel + cámaras SLZVolcableC1-5)
            </p>
            <CaladaCamerasPanel
              csv={tr?.csv.san_lorenzo_volcable_events}
              checkedCircuits={new Set()}
              filterActive={false}
              periodLabel={periodLabel}
              labels={{
                entitySingular: 'calle del volcable SL',
                entityPlural: 'calles del volcable SL',
                columnHeader: 'Calle volcable SL',
                trucksMetric: 'Camiones en volcable SL',
                activityMetric: 'Calles con actividad',
                exportName: 'volcable_sl_calles',
                tableName: 'san_lorenzo_volcable_events',
                splitExcelVsCamera: true,
              }}
            />
          </div>

          <div>
            <h3 className="font-semibold text-slate-900 mb-2">Aceites (OSL + Pto)</h3>
            <p className="text-sm text-slate-600 mb-3">
              Actividad de descargas de aceite en San Lorenzo
            </p>
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Aceites SL: tabla en construcción (aceites_sl_events por implementar)
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
