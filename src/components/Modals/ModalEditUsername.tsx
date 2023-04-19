import React, { useCallback } from "react"
import { useSelector } from "@xstate/react"
import FormUsername from "../FormUsername"
import useGlobalContext from "../useGlobalContext"
import { roomMachine } from "../../machines/roomMachine"
import { ActorRefFrom } from "xstate"

import { useCurrentUser, useAuthStore } from "../../state/authStore"

const isEditingUsernameSelector = (
  state: ActorRefFrom<typeof roomMachine>["state"],
) => state.matches("connected.participating.editing.username")

function ModalEditUsername() {
  const { send: authSend } = useAuthStore()
  const globalServices = useGlobalContext()
  const isEditingUsername = useSelector(
    globalServices.roomService,
    isEditingUsernameSelector,
  )
  const currentUser = useCurrentUser()
  const hideEditForm = useCallback(
    () => globalServices.roomService.send("CLOSE_EDIT"),
    [globalServices],
  )

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
