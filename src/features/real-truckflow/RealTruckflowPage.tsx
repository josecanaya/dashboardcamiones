import { RealJourneyDiagnosticsPageLegacy } from '../../pages/RealJourneyDiagnosticsPageLegacy'
import { GlobalRangeSelector } from './components/GlobalRangeSelector'
import { RealTruckflowWorkspaceProvider } from './RealTruckflowWorkspaceContext'
import { EtlWorkbenchProvider } from './etlWorkbench/EtlWorkbenchContext'

function RealTruckflowPageInner() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
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
