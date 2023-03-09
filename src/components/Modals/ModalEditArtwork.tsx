import React, { useCallback } from "react"

import FormAdminArtwork from "../FormAdminArtwork"
import useGlobalContext from "../useGlobalContext"
import { useSelector } from "@xstate/react"
import { roomMachine } from "../../machines/roomMachine"
import { ActorRefFrom } from "xstate"

const isEditingArtworkSelector = (
  state: ActorRefFrom<typeof roomMachine>["state"],
) => state.matches("connected.participating.editing.artwork")

function ModalEditArtwork() {
  const globalServices = useGlobalContext()
  const isEditingArtwork = useSelector(
    globalServices.roomService,
    isEditingArtworkSelector,
  )

  const hideEditForm = useCallback(
    () => globalServices.roomService.send("CLOSE_EDIT"),
    [globalServices],
  )

  return (
    <FormAdminArtwork
      isOpen={isEditingArtwork}
      onSubmit={(value) =>
        globalServices.roomService.send("SET_COVER", { data: value })
      }
      onClose={hideEditForm}
    />
  )
}

export default ModalEditArtwork
