import { useCallback, useEffect, useState } from "react"
import { Box, Button, Icon, IconButton, RecipeProps } from "@chakra-ui/react"
import { LuCable, LuCheck } from "react-icons/lu"

import { emitToSocket } from "../actors/socketActor"
import { useSettings } from "../hooks/useActors"
import socket from "../lib/socket"
import { toast } from "../lib/toasts"

type ButtonVariant = RecipeProps<"button">["variant"]

type Props = {
  buttonColorScheme?: string
  buttonVariant?: ButtonVariant
}

type BridgeStatusPayload = {
  type?: string
  data?: {
    message?: string
    daemonId?: string
    roomId?: string
    connected?: boolean
  }
}

/**
 * Admin control: ask an online Media Bridge daemon to connect to this room (ADR 0080).
 * Reflects room-scoped connection status (ADR 0081).
 */
export default function LinkMediaBridgeButton({
  buttonColorScheme,
  buttonVariant = "solid",
}: Props) {
  const settings = useSettings()
  const [linking, setLinking] = useState(false)
  const [connected, setConnected] = useState(false)

  const isBridgeRoom = settings.playbackControllerId === "bridge"

  useEffect(() => {
    if (!isBridgeRoom) {
      setConnected(false)
      return
    }

    emitToSocket("GET_MEDIA_BRIDGE_STATUS", {})

    const poll = setInterval(() => {
      emitToSocket("GET_MEDIA_BRIDGE_STATUS", {})
    }, 15_000)

    const onEvent = (payload: BridgeStatusPayload) => {
      if (payload.type === "MEDIA_BRIDGE_STATUS_CHANGED") {
        setConnected(Boolean(payload.data?.connected))
        return
      }
      if (payload.type === "LINK_MEDIA_BRIDGE_SUCCESS") {
        setLinking(false)
        setConnected(true)
        toast({
          title: "Media Bridge linked",
          description: "The DJ Mac bridge is connected to this room.",
          type: "success",
          duration: 4000,
        })
      }
      if (payload.type === "LINK_MEDIA_BRIDGE_FAILURE") {
        setLinking(false)
        toast({
          title: "Couldn't link Media Bridge",
          description:
            payload.data?.message ??
            "No Media Bridge is online. Start the bridge daemon on the DJ Mac, then try again.",
          type: "error",
          duration: 8000,
        })
      }
    }

    socket.on("event", onEvent)
    return () => {
      clearInterval(poll)
      socket.off("event", onEvent)
    }
  }, [isBridgeRoom])

  const onClick = useCallback(() => {
    if (connected) return
    setLinking(true)
    emitToSocket("LINK_MEDIA_BRIDGE", {})
  }, [connected])

  if (!isBridgeRoom) return null

  const label = connected ? "Media Bridge linked" : "Link to Media Bridge"
  const StatusIcon = connected ? LuCheck : LuCable

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
