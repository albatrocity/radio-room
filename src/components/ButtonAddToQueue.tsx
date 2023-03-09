import React, { useCallback } from "react"
import useCanDj from "./useCanDj"

import { IconButton, Icon, Button } from "@chakra-ui/react"
import { RiPlayListAddFill } from "react-icons/ri"
import useGlobalContext from "./useGlobalContext"

type Props = {
  showText?: boolean
}

function ButtonAddToQueue({ showText = true }: Props) {
  const canDj = useCanDj()
  const globalServices = useGlobalContext()

  const onAddToQueue = useCallback(() => {
    globalServices.roomService.send("EDIT_QUEUE")
  }, [globalServices.roomService])

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
