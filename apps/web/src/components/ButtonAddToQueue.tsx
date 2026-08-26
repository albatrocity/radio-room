import React from "react"
import useCanDj from "./useCanDj"

import { IconButton, Icon, Button, ButtonProps, Badge, Box } from "@chakra-ui/react"
import { LuListPlus } from "react-icons/lu"
import { EyeOff } from "lucide-react"
import { useModalsSend, useQueueCount, useCurrentRoom, useIsAdmin } from "../hooks/useActors"
import { Tooltip } from "./ui/tooltip"
import { getQueueCountDisplay } from "../lib/queueDisplayVisibility"

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

  const countDisplay = showCount
    ? getQueueCountDisplay(queueCount, room ?? undefined, isAdmin)
    : ({ kind: "hidden" } as const)
  const queueCountHiddenFromListeners = isAdmin && room?.showQueueCount === false

  const onAddToQueue = () => modalSend({ type: "EDIT_QUEUE" })

  if (!canDj) {
    return null
  }

  const renderCountBadge = (fontSize: "xs" | "2xs", minW: string, iconSize: number) => {
    if (countDisplay.kind === "hidden") return null

    const badge =
      countDisplay.kind === "redacted" ? (
        <Badge
          variant="solid"
          borderRadius="full"
          fontSize={fontSize}
          minW={minW}
          textAlign="center"
          display="inline-flex"
          alignItems="center"
          justifyContent="center"
          px={1}
        >
          <EyeOff size={iconSize} strokeWidth={2} />
        </Badge>
      ) : (
        <Badge variant="solid" borderRadius="full" fontSize={fontSize} minW={minW} textAlign="center">
          {countDisplay.value}
        </Badge>
      )

    const tooltipContent =
      countDisplay.kind === "redacted"
        ? "Queue count is hidden"
        : queueCountHiddenFromListeners
          ? "Queue count is hidden from listeners"
          : null

    if (!tooltipContent) return badge

    return (
      <Tooltip content={tooltipContent} showArrow>
        <Box as="span" display="inline-flex">
          {badge}
        </Box>
      </Tooltip>
    )
  }

  const showOverlayBadge = countDisplay.kind !== "hidden"

  return showText ? (
    <Button variant={variant} colorPalette={colorPalette} onClick={onAddToQueue} size={size}>
      <Icon as={LuListPlus} />
      {label}
      {renderCountBadge("xs", "5", 12)}
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
      {showOverlayBadge && (
        <Box position="absolute" top="-1" right="-1">
          {renderCountBadge("2xs", "4", 10)}
        </Box>
      )}
    </Box>
  )
}

export default ButtonAddToQueue
