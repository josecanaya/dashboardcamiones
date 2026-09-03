import { useState } from 'react'
import { useEtlWorkbenchOptional } from '../etlWorkbench/EtlWorkbenchContext'
import { CaladaCamerasPanel } from './CaladaCamerasPanel'

export function CaladaTab() {
  const wb = useEtlWorkbenchOptional()
  const tr = wb?.transformResult

  const [tab, setTab] = useState<'ricardone' | 'ricardone-liquid' | 'san-lorenzo'>('ricardone')

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
          onClick={() => setTab('ricardone-liquid')}
          className={`px-4 py-2 font-semibold transition ${
            tab === 'ricardone-liquid'
              ? 'border-b-2 border-violet-600 text-violet-900'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Líquidos Ric
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
        <CaladaCamerasPanel
          csv={tr?.csv.calada_camera_events}
          checkedCircuits={new Set()}
          filterActive={false}
          periodLabel={periodLabel}
          labels={{
            entitySingular: 'cámara de calada',
            entityPlural: 'cámaras de calada',
            columnHeader: 'Cámara de calada',
            trucksMetric: 'Camiones en calada',
            activityMetric: 'Cámaras con actividad',
            exportName: 'ricardone_calada',
            tableName: 'calada_camera_events',
            hourlyTrucksExcludeCameras: ['RicCalLiq'],
          }}
        />
      )}

      {tab === 'ricardone-liquid' && (
        <CaladaCamerasPanel
          csv={tr?.csv.calada_ricardone_liquid_events}
          checkedCircuits={new Set()}
          filterActive={false}
          periodLabel={periodLabel}
          labels={{
            entitySingular: 'cámara de calada líquida',
            entityPlural: 'cámaras de calada líquida',
            columnHeader: 'Cámara',
            trucksMetric: 'Camiones en calada líquida',
            activityMetric: 'Cámaras con actividad',
            exportName: 'ricardone_calada_liquid',
            tableName: 'calada_ricardone_liquid_events',
            hourlyTrucksExcludeCameras: [],
            showPatentesModal: true,
          }}
        />
      )}

      {tab === 'san-lorenzo' && (
        <CaladaCamerasPanel
          csv={tr?.csv.calada_sl_camera_events}
          checkedCircuits={new Set()}
          filterActive={false}
          periodLabel={periodLabel}
          labels={{
            entitySingular: 'cámara de calada',
            entityPlural: 'cámaras de calada',
            columnHeader: 'Cámara de calada',
            trucksMetric: 'Camiones en calada',
            activityMetric: 'Cámaras con actividad',
            exportName: 'san_lorenzo_calada',
            tableName: 'calada_sl_camera_events',
            hourlyTrucksExcludeCameras: [],
            showPatentesModal: true,
          }}
        />
      )}
    </div>
  )
}
