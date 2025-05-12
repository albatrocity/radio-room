import React, { useCallback } from "react"
import FormUsername from "../FormUsername"

import { useCurrentUser, useAuthStore } from "../../state/authStore"
import { useModalsStore } from "../../state/modalsState"

function ModalEditUsername() {
  const { send: authSend } = useAuthStore()
  const { send } = useModalsStore()
  const isEditingUsername = useModalsStore((s) => s.state.matches("username"))
  const currentUser = useCurrentUser()
  const hideEditForm = useCallback(() => send("CLOSE"), [send])

  return (
    <FormUsername
      isOpen={isEditingUsername}
      currentUser={currentUser}
      onClose={hideEditForm}
      onSubmit={(username) => {
        authSend({
          type: "UPDATE_USERNAME",
          data: username,
        })
        hideEditForm()
      }}
    />
  )
}

export default ModalEditUsername
