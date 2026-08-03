import React, { useEffect } from "react"
import { Center, Heading, Spinner, VStack } from "@chakra-ui/react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import Div100vh from "react-div-100vh"
import { useMachine } from "@xstate/react"
import { roomSetupMachine } from "../../machines/roomSetupMachine"
import { StationProtocol } from "../../types/StationProtocol"
import { authClient } from "@repo/auth/client"
import type { RoomSetup } from "../../types/Room"

export const Route = createFileRoute("/rooms/create")({
  component: CreateRoomPage,
})

function readRoomSetupFromSessionStorage(): RoomSetup {
  return {
    type: (sessionStorage.getItem("createRoomType") as RoomSetup["type"]) ?? "jukebox",
    title: sessionStorage.getItem("createRoomTitle") ?? "My Room",
    radioMetaUrl: sessionStorage.getItem("createRoomradioMetaUrl") ?? undefined,
    radioListenUrl: sessionStorage.getItem("createRoomRadioListenUrl") ?? undefined,
    deputizeOnJoin: sessionStorage.getItem("createRoomDeputizeOnJoin") === "true",
    public: sessionStorage.getItem("createRoomPublic") !== "false",
    radioProtocol:
      (sessionStorage.getItem("createRoomRadioProtocol") as StationProtocol) ?? "shoutcastv2",
    showId: sessionStorage.getItem("createRoomShowId") ?? undefined,
    liveIngestEnabled: sessionStorage.getItem("createRoomLiveIngestEnabled") === "true",
    liveWhepUrl: sessionStorage.getItem("createRoomLiveWhepUrl") ?? undefined,
    liveHlsUrl: sessionStorage.getItem("createRoomLiveHlsUrl") ?? undefined,
    playbackControllerId:
      sessionStorage.getItem("createRoomPlaybackControllerId") ?? undefined,
  }
}

function CreateRoomPage() {
  const navigate = useNavigate()
  const { data: session, isPending } = authClient.useSession()
  const isAdmin = session?.user.role === "admin"

  const [_state, send] = useMachine(roomSetupMachine)

  useEffect(() => {
    if (isPending) return
    if (!session || !isAdmin) {
      navigate({
        to: "/login",
        replace: true,
      })
    }
  }, [isPending, session, isAdmin, navigate])

  useEffect(() => {
    if (isPending || !session || !isAdmin) return

    const title = sessionStorage.getItem("createRoomTitle")
    const type = sessionStorage.getItem("createRoomType")
    if (!title || !type) {
      navigate({
        to: "/",
        replace: true,
        state: (s) => ({ ...s, toast: "Missing room settings. Start create from the lobby." }),
      })
      return
    }

    // Defer so React Strict Mode's first mount cleanup cancels before we POST
    let cancelled = false
    const frame = requestAnimationFrame(() => {
      if (cancelled) return
      if (sessionStorage.getItem("roomCreationInProgress") === "true") {
        console.log("[CreateRoom] Creation already in progress, skipping")
        return
      }
      sessionStorage.setItem("roomCreationInProgress", "true")
      console.log("[CreateRoom] Starting room creation for platform admin:", session.user.id)
      send({
        type: "SET_REQUIREMENTS",
        data: {
          room: readRoomSetupFromSessionStorage(),
        },
      })
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [isPending, session, isAdmin, send, navigate])

  return (
    <Div100vh>
      <Center h="100%">
        <VStack gap={4}>
          <Heading>Setting up your room...</Heading>
          <Spinner size="lg" />
        </VStack>
      </Center>
    </Div100vh>
  )
}
