import React from "react"
import AboutContent from "../AboutContent"
import Modal from "../Modal"
import { useModalsStore } from "../../state/modalsState"

function ModalAbout() {
  const { send } = useModalsStore()
  const isModalViewingHelp = useModalsStore((s) => s.state.matches("help"))

  return (
    <Modal
      isOpen={isModalViewingHelp}
      onClose={() => send("CLOSE")}
      heading="???"
    >
      <AboutContent />
    </Modal>
  )
}

export default ModalAbout
