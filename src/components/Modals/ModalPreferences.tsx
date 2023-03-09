import { useSelector } from "@xstate/react"
import React, { useCallback } from "react"

import Modal from "../Modal"
import FormTheme from "../FormTheme"
import useGlobalContext from "../useGlobalContext"

const isEditingPreferencesSelector = (state) =>
  state.matches("connected.participating.editing.preferences")

function ModalPreferences() {
  const globalServices = useGlobalContext()
  const isEditingPreferences = useSelector(
    globalServices.roomService,
    isEditingPreferencesSelector,
  )

  const hideEditForm = useCallback(
    () => globalServices.roomService.send("CLOSE_EDIT"),
    [globalServices],
  )

  return (
    <Modal
      isOpen={isEditingPreferences}
      onClose={hideEditForm}
      heading="Preferences"
    >
      <FormTheme />
    </Modal>
  )
}

export default ModalPreferences
