import React from "react"

import FormAdminArtwork from "../FormAdminArtwork"
import useGlobalContext from "../useGlobalContext"
import { useModalsStore } from "../../state/modalsState"

function ModalEditArtwork() {
  const globalServices = useGlobalContext()
  const { send } = useModalsStore()
  const isEditingArtwork = useModalsStore((s) => s.state.matches("artwork"))

  const hideEditForm = () => send("CLOSE")

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
