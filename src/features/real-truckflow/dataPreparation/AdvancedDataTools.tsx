import { ExtraccionDatosTab } from '../tabs/ExtraccionDatosTab'
import { AnalisisLocalTab } from '../tabs/AnalisisLocalTab'
import { AgenteChatTab } from '../tabs/AgenteChatTab'
import { MovimientosBackupPanel } from '../components/MovimientosBackupPanel'

type Props = {
  /** Vista inicial abierta (deep-link, R08): 'extraccion-avanzada' | 'analisis-avanzado' | undefined */
  initialSection?: 'extraccion' | 'analisis' | null
  /** Notifica cuando se sube un Excel de movimientos (para reinspeccionar disponibilidad). */
  onExcelIngested?: () => void
}

const summaryStyle: React.CSSProperties = {
  cursor: 'pointer',
  fontWeight: 600,
  color: 'var(--ui-primary)',
  padding: '4px 0',
}

/**
 * Herramientas avanzadas de datos (R07): agrupa en Disclosures las capacidades legacy
 * (extracción por hora/sede, JSON manual, Excel de tiempos, fases 1–3 manuales, KPI/CSV,
 * ingest de Excel de movimientos, corridas guardadas y asistente). No copia algoritmos;
 * reutiliza los tabs existentes con `embedded={true}` para que no dupliquen encabezados.
 */
export function AdvancedDataTools({ initialSection = null, onExcelIngested }: Props): JSX.Element {
  return (
    <section className="ui-panel" aria-label="Herramientas avanzadas">
      <header className="mb-3">
        <p className="ui-label">Avanzado</p>
        <p className="ui-muted" style={{ fontSize: 13 }}>
          No hace falta abrir esto para el caso normal. Está para casos por sede/horas, subir Excel manual,
          fases individuales, KPI/CSV, corridas guardadas y el asistente.
        </p>
      </header>

      <details open={initialSection === 'extraccion' || undefined}>
        <summary style={summaryStyle}>Extracción por horas o sede</summary>
        <div className="mt-3">
          <ExtraccionDatosTab embedded />
        </div>
      </details>

      <details open={initialSection === 'analisis' || undefined} className="mt-2">
        <summary style={summaryStyle}>Archivos locales y fases manuales</summary>
        <div className="mt-3">
          <AnalisisLocalTab embedded />
        </div>
      </details>

      <details className="mt-2">
        <summary style={summaryStyle}>Backup Excel de Movimientos por Contrato</summary>
        <div className="mt-3">
          <MovimientosBackupPanel onIngested={onExcelIngested} />
        </div>
      </details>

      <details className="mt-2">
        <summary style={summaryStyle}>Asistente de datos</summary>
        <div className="mt-3">
          <AgenteChatTab />
        </div>
      </details>
    </section>
  )
}
