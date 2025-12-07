import React from "react"
import useCanDj from "./useCanDj"

import { IconButton, Icon, Button, ButtonProps, Badge, Box } from "@chakra-ui/react"
import { RiPlayListAddFill } from "react-icons/ri"
import { useModalsSend, useQueueCount, useCurrentRoom } from "../hooks/useActors"

type Props = {
  showText?: boolean
  variant?: ButtonProps["variant"]
  colorPalette?: ButtonProps["colorPalette"]
  label?: string
  size?: ButtonProps["size"]
  showCount?: boolean
}

function ButtonAddToQueue({
  showText = true,
  label = "Add to Queue",
  showCount = true,
  variant = "ghost",
  colorPalette,
  size = "md",
}: Props) {
  const canDj = useCanDj()
  const modalSend = useModalsSend()
  const queueCount = useQueueCount()
  const room = useCurrentRoom()

  // showQueueCount defaults to true when undefined
  const showQueueCount = showCount && room?.showQueueCount !== false

  const onAddToQueue = () => modalSend({ type: "EDIT_QUEUE" })

  if (!canDj) {
    return null
  }

  const countBadge =
    showQueueCount && queueCount > 0 ? (
      <Badge variant="solid" borderRadius="full" fontSize="xs" minW="5" textAlign="center">
        {queueCount}
      </Badge>
    ) : null

  return showText ? (
    <Button variant={variant} colorPalette={colorPalette} onClick={onAddToQueue} size={size}>
      <Icon as={RiPlayListAddFill} />
      {label}
      {countBadge}
    </Button>
  ) : (
    <Box position="relative" display="inline-block">
      <IconButton
        aria-label="Add to Queue"
        variant={variant}
        colorPalette={colorPalette}
        onClick={onAddToQueue}
        size={size}
      >
        <Icon as={RiPlayListAddFill} />
      </IconButton>
      {showQueueCount && queueCount > 0 && (
        <Badge
          variant="solid"
          borderRadius="full"
          fontSize="2xs"
          position="absolute"
          top="-1"
          right="-1"
          minW="4"
          textAlign="center"
        >
          {queueCount}
        </Badge>
      )}
    </Box>
  )
}

export default ButtonAddToQueue
