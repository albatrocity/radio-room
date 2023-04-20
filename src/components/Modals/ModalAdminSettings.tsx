import React from "react"

import FormAdminSettings from "../FormAdminSettings"
import useGlobalContext from "../useGlobalContext"
import { useModalsStore } from "../../state/modalsState"

function ModalAdminSettings() {
  const globalServices = useGlobalContext()
  const { send } = useModalsStore()
  const isEditingSettings = useModalsStore((s) => s.state.matches("settings"))

  const hideEditForm = () => send("CLOSE")

  return (
    <FormAdminSettings
      isOpen={isEditingSettings}
      onClose={hideEditForm}
      onSubmit={(value) => {
        globalServices.roomService.send("SET_SETTINGS", { data: value })
      }}
    />
  )
}

export default ModalAdminSettings
