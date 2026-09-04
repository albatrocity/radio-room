import { AdminSettingsSurface } from "../AdminSettingsSurface"

/**
 * Modal path for Admin Settings on viewports below lg. Panel path lives in Room `IntegratedPanelSlot`.
 *
 * Plugin links on Overview are driven by schemas, but each plugin still needs an
 * `EDIT_*` / `settings.{name}` state in `modalsMachine` or the click is a no-op.
 * See docs/plugins/getting-started.md ("Register the admin settings view").
 */
function ModalAdminSettings() {
  return <AdminSettingsSurface variant="modal" />
}

export default ModalAdminSettings
