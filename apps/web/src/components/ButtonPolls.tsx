import { IconButton, Icon, Button, ButtonProps, Box } from "@chakra-ui/react"
import { LuVote } from "react-icons/lu"
import {
  useActivePoll,
  useModalsSend,
  usePollHistory,
} from "../hooks/useActors"

type Props = {
  showText?: boolean
  variant?: ButtonProps["variant"]
  colorPalette?: ButtonProps["colorPalette"]
  label?: string
  size?: ButtonProps["size"]
}

function ButtonPolls({
  showText = true,
  label = "Polls",
  variant = "ghost",
  colorPalette,
  size = "md",
}: Props) {
  const modalSend = useModalsSend()
  const activePoll = useActivePoll()
  const history = usePollHistory()

  const hasPolls = activePoll != null || history.length > 0
  const hasActiveOpenPoll = activePoll?.status === "open"

  if (!hasPolls) {
    return null
  }

  const onOpenPolls = () => modalSend({ type: "VIEW_POLL_HISTORY" })

  const activeIndicator = hasActiveOpenPoll ? (
    <Box
      position="absolute"
      top="1.5"
      right="1.5"
      boxSize="2"
      borderRadius="full"
      bg="primary.solid"
      borderWidth="1.5px"
      borderColor="bg"
      pointerEvents="none"
      aria-hidden
    />
  ) : null

  return showText ? (
    <Button
      position="relative"
      variant={variant}
      colorPalette={colorPalette}
      onClick={onOpenPolls}
      size={size}
    >
      <Icon as={LuVote} />
      {label}
      {activeIndicator}
    </Button>
  ) : (
    <IconButton
      aria-label="Polls"
      position="relative"
      variant={variant}
      colorPalette={colorPalette}
      onClick={onOpenPolls}
      size={size}
    >
      <Icon as={LuVote} />
      {activeIndicator}
    </IconButton>
  )
}

export default ButtonPolls
