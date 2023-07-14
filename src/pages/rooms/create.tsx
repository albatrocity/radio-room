import React, { useEffect } from "react"
import { Center, Heading, Spinner, VStack } from "@chakra-ui/react"
import { useLocation } from "@reach/router"
import { navigate } from "gatsby"
import Div100vh from "react-div-100vh"
import { useMachine } from "@xstate/react"
import { roomSetupMachine } from "../../machines/roomSetupMachine"
import { useAuthStore } from "../../state/authStore"

type Props = {}

export default function CreateRoomPage({}: Props) {
  const location = useLocation()
  const urlParams = new URLSearchParams(location.search)
  const challenge = urlParams.get("challenge")
  const userId = urlParams.get("userId")
  const roomType = sessionStorage.getItem("createRoomType") ?? "jukebox"
  const roomTitle = sessionStorage.getItem("createRoomTitle")
  const { state, send: authSend } = useAuthStore()

  const [_state, send] = useMachine(roomSetupMachine, {
    context: {
      challenge,
      userId,
      room: {
        type: roomType === "jukebox" ? "jukebox" : "radio",
        title: roomTitle ?? "My Room",
      },
    },
  })

  useEffect(() => {
    if (!challenge || !userId) {
      navigate("/", {
        replace: true,
        state: {
          toast: {
            title: "Error",
            description: "Invalid authorization challenge",
            status: "error",
          },
        },
      })
      return
    }
    authSend("SET_CURRENT_USER", {
      data: {
        currentUser: {
          userId,
        },
        isNewUser: true,
        isAdmin: true,
      },
    })
    send("SET_REQUIREMENTS", { data: { challenge, userId } })
  }, [challenge, userId, send])

  return (
    <Div100vh>
      <Center h="100%">
        <VStack spacing={4}>
          <Heading>Setting up your room...</Heading>
          <Spinner size="lg" />
        </VStack>
      </Center>
    </Div100vh>
  )
}
