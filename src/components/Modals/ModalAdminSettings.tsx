import React, { useCallback } from "react"
import { useSelector } from "@xstate/react"

import FormAdminSettings from "../FormAdminSettings"
import useGlobalContext from "../useGlobalContext"
import { ActorRefFrom } from "xstate"
import { roomMachine } from "../../machines/roomMachine"

const isEditingSettingsSelector = (
  state: ActorRefFrom<typeof roomMachine>["state"],
) => {
  return state.matches("connected.participating.editing.settings")
}

function ModalAdminSettings() {
  const globalServices = useGlobalContext()
  const isEditingSettings = useSelector(
    globalServices.roomService,
    isEditingSettingsSelector,
  )

  const hideEditForm = useCallback(
    () => globalServices.roomService.send("CLOSE_EDIT"),
    [globalServices],
  )

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
