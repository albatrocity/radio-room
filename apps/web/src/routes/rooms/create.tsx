import React, { useEffect, useRef } from "react"
import { Center, Heading, Spinner, VStack } from "@chakra-ui/react"
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router"
import Div100vh from "react-div-100vh"
import { useMachine } from "@xstate/react"
import { roomSetupMachine } from "../../machines/roomSetupMachine"
import { StationProtocol } from "../../types/StationProtocol"
import { authClient } from "@repo/auth/client"

export const Route = createFileRoute("/rooms/create")({
  component: CreateRoomPage,
})

function CreateRoomPage() {
  const navigate = useNavigate()
  const searchParams = useSearch({ from: "/rooms/create" })
  const challenge = (searchParams as any).challenge
  const userId = (searchParams as any).userId
  const { data: session, isPending } = authClient.useSession()

  const hasStartedCreation = useRef(false)

  const [_state, send] = useMachine(roomSetupMachine)

  useEffect(() => {
    if (!isPending && !session) {
      navigate({
        to: "/login",
        replace: true,
      })
    }
  }, [isPending, session, navigate])

  useEffect(() => {
    if (hasStartedCreation.current) {
      console.log("[CreateRoom] Already started creation (ref), skipping")
      return
    }

    const creationInProgress = sessionStorage.getItem("roomCreationInProgress")
    if (creationInProgress === challenge) {
      console.log("[CreateRoom] Already started creation (sessionStorage), skipping")
      return
    }

    if (!challenge || !userId) {
      navigate({
        to: "/",
        replace: true,
        state: (s) => ({ ...s, toast: "Missing challenge or userId" }),
      })
      return
    }

    hasStartedCreation.current = true
    sessionStorage.setItem("roomCreationInProgress", challenge)
    console.log("[CreateRoom] Starting room creation for user:", userId)

    send({
      type: "SET_REQUIREMENTS",
      data: {
        challenge,
        userId,
        room: {
          type: sessionStorage.getItem("createRoomType") ?? "jukebox",
          title: sessionStorage.getItem("createRoomTitle") ?? "My Room",
          radioMetaUrl: sessionStorage.getItem("createRoomradioMetaUrl") ?? undefined,
          radioListenUrl: sessionStorage.getItem("createRoomRadioListenUrl"),
          deputizeOnJoin: sessionStorage.getItem("createRoomDeputizeOnJoin") === "true",
          radioProtocol:
            (sessionStorage.getItem("createRoomRadioProtocol") as StationProtocol) ?? "shoutcastv2",
        },
      },
    })
  }, [challenge, userId, send, navigate])

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
