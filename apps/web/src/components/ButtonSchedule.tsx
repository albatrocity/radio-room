import useCanDj from "./useCanDj"

import { IconButton, Icon, Button, ButtonProps, Badge, Box } from "@chakra-ui/react"
import { RiPlayListAddFill } from "react-icons/ri"
import { useCurrentRoom, useIsAdmin, useModalsSend } from "../hooks/useActors"
import { LuClock } from "react-icons/lu"

type Props = {
  showText?: boolean
  variant?: ButtonProps["variant"]
  colorPalette?: ButtonProps["colorPalette"]
  label?: string
  size?: ButtonProps["size"]
  showCount?: boolean
}

function ButtonSchedule({
  showText = true,
  label = "View Schedule",
  variant = "ghost",
  colorPalette,
  size = "md",
}: Props) {
  const modalSend = useModalsSend()
  const room = useCurrentRoom()
  const isAdmin = useIsAdmin()
  const showId = room?.showId
  const visible = !!showId && (isAdmin || room?.showSchedulePublic === true)

  const onViewSchedule = () => modalSend({ type: "VIEW_SCHEDULE" })

  if (!visible) {
    return null
  }

  return showText ? (
    <Button variant={variant} colorPalette={colorPalette} onClick={onViewSchedule} size={size}>
      <Icon as={RiPlayListAddFill} />
      {label}
    </Button>
  ) : (
    <Box position="relative" display="inline-block">
      <IconButton
        aria-label="View Schedule"
        variant={variant}
        colorPalette={colorPalette}
        onClick={onViewSchedule}
        size={size}
      >
        <Icon as={LuClock} />
      </IconButton>
    </Box>
  )
}

export default ButtonSchedule
