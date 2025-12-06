import React from "react"
import AboutContent from "../AboutContent"
import Modal from "../Modal"
import { useModalsSend, useIsModalOpen } from "../../hooks/useActors"

function ModalAbout() {
  const modalSend = useModalsSend()
  const isModalViewingHelp = useIsModalOpen("help")

  return (
    <Modal isOpen={isModalViewingHelp} onClose={() => modalSend({ type: "CLOSE" })}>
      <AboutContent />
    </Modal>
  )
}

export default ModalAbout
