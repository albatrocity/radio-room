import React from "react"
import useCanDj from "./useCanDj"

import { IconButton, Icon, Button, ButtonProps, Badge, Box } from "@chakra-ui/react"
import { LuListPlus } from "react-icons/lu"
import { useModalsSend, useQueueCount, useCurrentRoom, useIsAdmin } from "../hooks/useActors"
import { Tooltip } from "./ui/tooltip"

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
  const isAdmin = useIsAdmin()

  // showQueueCount defaults to true when undefined; room admins always see it
  const showQueueCount = showCount && (isAdmin || room?.showQueueCount !== false)
  const queueCountHiddenFromListeners = isAdmin && room?.showQueueCount === false

  const onAddToQueue = () => modalSend({ type: "EDIT_QUEUE" })

  if (!canDj) {
    return null
  }

  const renderCountBadge = (fontSize: "xs" | "2xs", minW: string) => {
    if (!showQueueCount || queueCount <= 0) return null

    const badge = (
      <Badge variant="solid" borderRadius="full" fontSize={fontSize} minW={minW} textAlign="center">
        {queueCount}
      </Badge>
    )

    if (!queueCountHiddenFromListeners) return badge

    return (
      <Tooltip content="Queue count is hidden from listeners" showArrow>
        <Box as="span" display="inline-flex">
          {badge}
        </Box>
      </Tooltip>
    )
  }

  return showText ? (
    <Button variant={variant} colorPalette={colorPalette} onClick={onAddToQueue} size={size}>
      <Icon as={LuListPlus} />
      {label}
      {renderCountBadge("xs", "5")}
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
        <Icon as={LuListPlus} />
      </IconButton>
      {showQueueCount && queueCount > 0 && (
        <Box position="absolute" top="-1" right="-1">
          {renderCountBadge("2xs", "4")}
        </Box>
      )}
    </Box>
  )
}

export default ButtonAddToQueue
