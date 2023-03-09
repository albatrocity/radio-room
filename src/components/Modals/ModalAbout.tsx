import React from "react"
import { useSelector } from "@xstate/react"
import { ActorRefFrom } from "xstate"
import { roomMachine } from "../../machines/roomMachine"
import AboutContent from "../AboutContent"
import Modal from "../Modal"
import useGlobalContext from "../useGlobalContext"

const isModalViewingHelpSelector = (
  state: ActorRefFrom<typeof roomMachine>["state"],
) => state.matches("modalViewing.help")

function ModalAbout() {
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
