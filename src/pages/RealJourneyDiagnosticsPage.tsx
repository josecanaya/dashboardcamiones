import { COMMITTEE_ETL_LITE_MODE } from '../config/committeeEtlLite'
import { RealTruckflowPage } from '../features/real-truckflow/RealTruckflowPage'
import { RealJourneyDiagnosticsPageLegacy } from './RealJourneyDiagnosticsPageLegacy'

/**
 * Datos reales: en modo comité / ETL usa el workspace unificado (`features/real-truckflow`).
 * Con dashboard completo conserva la implementación histórica en `RealJourneyDiagnosticsPageLegacy`.
 */
export function RealJourneyDiagnosticsPage() {
  if (COMMITTEE_ETL_LITE_MODE) return <RealTruckflowPage />
  return <RealJourneyDiagnosticsPageLegacy />
}
