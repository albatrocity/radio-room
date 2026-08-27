import { Suspense, lazy, memo } from "react"

import { useActiveIntegratedPanelSlot } from "../../hooks/useIntegratedPanelPresentation"
import { UserGameStateSurface } from "../Modals/UserGameStateSurface"

const AdminSettingsSurface = lazy(() =>
  import("../Modals/AdminSettingsSurface").then((m) => ({ default: m.AdminSettingsSurface })),
)

function IntegratedPanelSlot() {
  const slot = useActiveIntegratedPanelSlot()

  if (!slot) return null

  if (slot === "gameState") {
    return <UserGameStateSurface variant="panel" />
  }

  return (
    <Suspense fallback={null}>
      <AdminSettingsSurface variant="panel" />
    </Suspense>
  )
}

export default memo(IntegratedPanelSlot)
