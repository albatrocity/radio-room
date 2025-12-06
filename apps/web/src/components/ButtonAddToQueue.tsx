import React from "react"
import useCanDj from "./useCanDj"

import { IconButton, Icon, Button, ButtonProps } from "@chakra-ui/react"
import { RiPlayListAddFill } from "react-icons/ri"
import { useModalsSend } from "../hooks/useActors"

type Props = {
  showText?: boolean
  variant?: ButtonProps["variant"]
}

function ButtonAddToQueue({ showText = true, variant = "ghost" }: Props) {
  const canDj = useCanDj()
  const modalSend = useModalsSend()

  const onAddToQueue = () => modalSend({ type: "EDIT_QUEUE" })

  if (!canDj) {
    return null
  }

  return showText ? (
    <Button variant={variant} onClick={onAddToQueue} colorPalette="action">
      <Icon as={RiPlayListAddFill} />
      Add to queue
    </Button>
  ) : (
    <IconButton aria-label="Add to Queue" variant={variant} onClick={onAddToQueue}>
      <Icon as={RiPlayListAddFill} boxSize={5} />
    </IconButton>
  )
}

export default ButtonAddToQueue
