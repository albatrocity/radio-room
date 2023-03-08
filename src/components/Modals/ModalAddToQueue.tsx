import { useSelector } from "@xstate/react"
import React, { useCallback } from "react"
import FormAddToQueue from "../FormAddToQueue"
import Modal from "../Modal"
import useGlobalContext from "../useGlobalContext"

type Props = {}

const isAddingToQueueSelector = (state) =>
  state.matches("connected.participating.editing.queue")

function ModalAddToQueue({}: Props) {
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
