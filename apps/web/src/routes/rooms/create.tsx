import React, { useEffect, useRef } from "react"
import { Center, Heading, Spinner, VStack } from "@chakra-ui/react"
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router"
import Div100vh from "react-div-100vh"
import { useMachine } from "@xstate/react"
import { roomSetupMachine } from "../../machines/roomSetupMachine"
import { StationProtocol } from "../../types/StationProtocol"

export const Route = createFileRoute("/rooms/create")({
  component: CreateRoomPage,
})

function CreateRoomPage() {
  const navigate = useNavigate()
  const searchParams = useSearch({ from: "/rooms/create" })
  const challenge = (searchParams as any).challenge
  const userId = (searchParams as any).userId

  // Prevent double room creation (React StrictMode runs effects twice)
  const hasStartedCreation = useRef(false)

  const [_state, send] = useMachine(roomSetupMachine, {
    context: {
      challenge,
      userId,
    },
  })

  useEffect(() => {
    // Guard against double execution (React StrictMode + potential remounts)
    if (hasStartedCreation.current) {
      console.log("[CreateRoom] Already started creation (ref), skipping")
      return
    }

    // Also check sessionStorage for cross-mount protection
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

    // Mark creation as started before sending
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
