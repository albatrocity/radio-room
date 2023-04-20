import React from "react"
import FormAddToQueue from "../FormAddToQueue"
import Modal from "../Modal"
import { useModalsStore } from "../../state/modalsState"

function ModalAddToQueue() {
  const { send } = useModalsStore()
  const isAddingToQueue = useModalsStore((s) => s.state.matches("queue"))
  const hideEditForm = () => send("CLOSE")

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
