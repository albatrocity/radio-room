import React, { useCallback } from "react"
import { useSelector } from "@xstate/react"
import FormUsername from "../FormUsername"
import useGlobalContext from "../useGlobalContext"

const isEditingUsernameSelector = (state) =>
  state.matches("connected.participating.editing.username")
const currentUserSelector = (state) => state.context.currentUser

function ModalEditUsername() {
  const globalServices = useGlobalContext()
  const isEditingUsername = useSelector(
    globalServices.roomService,
    isEditingUsernameSelector,
  )
  const currentUser = useSelector(
    globalServices.authService,
    currentUserSelector,
  )
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
        globalServices.authService.send({
          type: "UPDATE_USERNAME",
          data: username,
        })
        hideEditForm()
      }}
    />
  )
}

export default ModalEditUsername
