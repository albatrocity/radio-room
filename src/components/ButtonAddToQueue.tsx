import React from "react"
import useCanDj from "./useCanDj"

import { IconButton, Icon, Button } from "@chakra-ui/react"
import { RiPlayListAddFill } from "react-icons/ri"
import { useModalsStore } from "../state/modalsState"

type Props = {
  showText?: boolean
}

function ButtonAddToQueue({ showText = true }: Props) {
  const canDj = useCanDj()
  const { send: modalSend } = useModalsStore()

  const onAddToQueue = () => modalSend("EDIT_QUEUE")

  if (!canDj) {
    return null
  }

  return showText ? (
    <Button leftIcon={<Icon as={RiPlayListAddFill} />} onClick={onAddToQueue}>
      Add to queue
    </Button>
  ) : (
    <IconButton
      icon={<Icon as={RiPlayListAddFill} boxSize={5} />}
      aria-label="Add to Queue"
      variant="ghost"
      onClick={onAddToQueue}
    />
  )
}

export default ButtonAddToQueue
