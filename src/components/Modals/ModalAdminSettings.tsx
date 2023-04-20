import React from "react"

import FormAdminSettings from "../FormAdminSettings"
import { useModalsStore } from "../../state/modalsState"
import { useAdminStore } from "../../state/adminStore"

function ModalAdminSettings() {
  const { send } = useModalsStore()
  const { send: adminSend } = useAdminStore()
  const isEditingSettings = useModalsStore((s) => s.state.matches("settings"))

  const hideEditForm = () => send("CLOSE")

  return (
    <FormAdminSettings
      isOpen={isEditingSettings}
      onClose={hideEditForm}
      onSubmit={(value) => {
        adminSend("SET_SETTINGS", { data: value })
      }}
    />
  )
}

export default ModalAdminSettings
