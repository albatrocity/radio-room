import { AdminSettingsSurface } from "../AdminSettingsSurface"

/** Modal path for Admin Settings on viewports below lg. Panel path lives in Room `IntegratedPanelSlot`. */
function ModalAdminSettings() {
  return <AdminSettingsSurface variant="modal" />
}

export default ModalAdminSettings
