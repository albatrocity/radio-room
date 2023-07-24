import React from "react"
import useCanDj from "./useCanDj"

import { IconButton, Icon, Button, ButtonProps } from "@chakra-ui/react"
import { RiPlayListAddFill } from "react-icons/ri"
import { useModalsStore } from "../state/modalsState"

type Props = {
  showText?: boolean
  variant?: ButtonProps["variant"]
}

function ButtonAddToQueue({ showText = true, variant = "ghost" }: Props) {
  const canDj = useCanDj()
  const { send: modalSend } = useModalsStore()

  const onAddToQueue = () => modalSend("EDIT_QUEUE")

  if (!canDj) {
    return null
  }

  return showText ? (
    <Button
      variant={variant}
      leftIcon={<Icon as={RiPlayListAddFill} />}
      onClick={onAddToQueue}
    >
      Add to queue
    </Button>
  ) : (
    <IconButton
      icon={<Icon as={RiPlayListAddFill} boxSize={5} />}
      aria-label="Add to Queue"
      variant={variant}
      onClick={onAddToQueue}
    />
  )
}

export default ButtonAddToQueue
