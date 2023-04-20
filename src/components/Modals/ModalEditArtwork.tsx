import React from "react"

import FormAdminArtwork from "../FormAdminArtwork"
import { useModalsStore } from "../../state/modalsState"
import { useAdminStore } from "../../state/adminStore"

function ModalEditArtwork() {
  const { send } = useModalsStore()
  const { send: adminSend } = useAdminStore()
  const isEditingArtwork = useModalsStore((s) => s.state.matches("artwork"))

  const hideEditForm = () => send("CLOSE")

  return (
    <FormAdminArtwork
      isOpen={isEditingArtwork}
      onSubmit={(value) => adminSend("SET_COVER", { data: value })}
      onClose={hideEditForm}
    />
  )
}

export default ModalEditArtwork
