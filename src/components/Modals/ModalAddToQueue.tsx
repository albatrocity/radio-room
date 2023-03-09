import { useSelector } from "@xstate/react"
import React, { useCallback } from "react"
import { ActorRefFrom } from "xstate"
import { roomMachine } from "../../machines/roomMachine"
import FormAddToQueue from "../FormAddToQueue"
import Modal from "../Modal"
import useGlobalContext from "../useGlobalContext"

const isAddingToQueueSelector = (
  state: ActorRefFrom<typeof roomMachine>["state"],
) => state.matches("connected.participating.editing.queue")

function ModalAddToQueue() {
  const globalServices = useGlobalContext()
  const isAddingToQueue = useSelector(
    globalServices.roomService,
    isAddingToQueueSelector,
  )
  const hideEditForm = useCallback(
    () => globalServices.roomService.send("CLOSE_EDIT"),
    [globalServices.roomService],
  )

  return (
    <Modal
      isOpen={isAddingToQueue}
      onClose={hideEditForm}
      heading="Add to play queue"
    >
      <FormAddToQueue />
    </Modal>
  )
}

export default ModalAddToQueue
