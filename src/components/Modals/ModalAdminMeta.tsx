import { useSelector } from "@xstate/react"
import React, { useCallback } from "react"
import { ActorRefFrom } from "xstate"
import { roomMachine } from "../../machines/roomMachine"

import FormAdminMeta from "../FormAdminMeta"
import Modal from "../Modal"
import useGlobalContext from "../useGlobalContext"

const isEditingMetaSelector = (
  state: ActorRefFrom<typeof roomMachine>["state"],
) => state.matches("connected.participating.editing.meta")

function ModalAdminMeta() {
  const globalServices = useGlobalContext()
  const isEditingMeta = useSelector(
    globalServices.roomService,
    isEditingMetaSelector,
  )

  const hideEditForm = useCallback(
    () => globalServices.roomService.send("CLOSE_EDIT"),
    [globalServices],
  )

  return (
    <Modal
      isOpen={isEditingMeta}
      onClose={hideEditForm}
      heading="Set Station Info"
    >
      <FormAdminMeta
        onSubmit={(value) =>
          globalServices.roomService.send("FIX_META", { data: value })
        }
      />
    </Modal>
  )
}

export default ModalAdminMeta
