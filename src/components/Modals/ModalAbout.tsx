import { useSelector } from "@xstate/react"
import React from "react"
import AboutContent from "../AboutContent"
import Modal from "../Modal"
import useGlobalContext from "../useGlobalContext"

type Props = {}

const isModalViewingHelpSelector = (state) => state.matches("modalViewing.help")

function ModalAbout({}: Props) {
  const globalServices = useGlobalContext()
  const isModalViewingHelp = useSelector(
    globalServices.roomService,
    isModalViewingHelpSelector,
  )

  return (
    <Modal
      isOpen={isModalViewingHelp}
      onClose={() => globalServices.roomService.send("CLOSE_VIEWING")}
      heading="???"
    >
      <AboutContent />
    </Modal>
  )
}

export default ModalAbout
