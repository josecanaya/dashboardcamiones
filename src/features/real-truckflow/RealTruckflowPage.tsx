import { RealJourneyDiagnosticsPageLegacy } from '../../pages/RealJourneyDiagnosticsPageLegacy'
import { GlobalRangeSelector } from './components/GlobalRangeSelector'
import { TruckPlateRegistryLauncher } from './components/TruckPlateRegistryLauncher'
import { RealTruckflowWorkspaceProvider } from './RealTruckflowWorkspaceContext'
import { EtlWorkbenchProvider } from './etlWorkbench/EtlWorkbenchContext'

function RealTruckflowPageInner() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Excluí servicios, asociados y particulares del análisis operativo.
        </p>
        <TruckPlateRegistryLauncher />
      </div>
      <GlobalRangeSelector />
      <div className="min-h-0 flex-1">
        <RealJourneyDiagnosticsPageLegacy />
      </div>
    </div>
  )
}

export function RealTruckflowPage() {
  return (
    <RealTruckflowWorkspaceProvider>
      <EtlWorkbenchProvider>
        <RealTruckflowPageInner />
      </EtlWorkbenchProvider>
    </RealTruckflowWorkspaceProvider>
  )
}
