import { UserGameStateSurface } from "./UserGameStateSurface"

/** Modal path for Game State on viewports below lg. Panel path lives in Room `IntegratedPanelSlot`. */
function ModalUserGameState() {
  return <UserGameStateSurface variant="modal" />
}

export default ModalUserGameState
