import React, { useCallback } from "react"
import FormUsername from "../FormUsername"

import { useCurrentUser, useAuthSend, useModalsSend, useIsModalOpen } from "../../hooks/useActors"

function ModalEditUsername() {
  const authSend = useAuthSend()
  const modalSend = useModalsSend()
  const isEditingUsername = useIsModalOpen("username")
  const currentUser = useCurrentUser()
  const hideEditForm = useCallback(() => modalSend({ type: "CLOSE" }), [modalSend])

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
