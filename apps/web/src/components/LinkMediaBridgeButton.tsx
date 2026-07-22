import { Box, Button, Icon, IconButton, RecipeProps } from "@chakra-ui/react"
import { LuCable, LuCheck } from "react-icons/lu"

import {
  useMediaBridgeConnected,
  useMediaBridgeLinking,
  useMediaBridgeSend,
  useSettings,
} from "../hooks/useActors"

type ButtonVariant = RecipeProps<"button">["variant"]

type Props = {
  buttonColorScheme?: string
  buttonVariant?: ButtonVariant
}

/**
 * Admin control: ask an online Media Bridge daemon to connect to this room (ADR 0080).
 * Status via mediaBridgeActor (ADR 0081).
 */
export default function LinkMediaBridgeButton({
  buttonColorScheme,
  buttonVariant = "solid",
}: Props) {
  const settings = useSettings()
  const connected = useMediaBridgeConnected()
  const linking = useMediaBridgeLinking()
  const send = useMediaBridgeSend()

  const isBridgeRoom = settings.playbackControllerId === "bridge"
  if (!isBridgeRoom) return null

  const label = connected ? "Media Bridge linked" : "Link to Media Bridge"
  const StatusIcon = connected ? LuCheck : LuCable
  const onClick = () => {
    if (connected || linking) return
    send({ type: "LINK" })
  }

  return (
    <>
      <Box hideBelow="sm">
        <Button
          size="xs"
          variant={buttonVariant}
          colorPalette={connected ? "green" : buttonColorScheme}
          onClick={onClick}
          disabled={linking || connected}
          loading={linking}
          title={
            connected
              ? "Media Bridge is connected to this room"
              : "Connect the DJ Mac Media Bridge to this room"
          }
        >
          <Icon as={StatusIcon} />
          {label}
        </Button>
      </Box>
      <Box hideFrom="sm">
        <IconButton
          size="md"
          variant={buttonVariant}
          colorPalette={connected ? "green" : buttonColorScheme}
          onClick={onClick}
          disabled={linking || connected}
          loading={linking}
          aria-label={label}
          title={
            connected
              ? "Media Bridge is connected to this room"
              : "Connect the DJ Mac Media Bridge to this room"
          }
        >
          <Icon as={StatusIcon} />
        </IconButton>
      </Box>
    </>
  )
}
