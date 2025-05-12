import React, { useEffect } from "react"
import { Center, Heading, Spinner, VStack } from "@chakra-ui/react"
import { useLocation } from "@reach/router"
import { navigate } from "gatsby"
import Div100vh from "react-div-100vh"
import { useMachine } from "@xstate/react"
import { roomSetupMachine } from "../../machines/roomSetupMachine"
import { StationProtocol } from "../../types/StationProtocol"

type Props = {}

export default function CreateRoomPage({}: Props) {
  const location = useLocation()
  const urlParams = new URLSearchParams(location.search)
  const challenge = urlParams.get("challenge")
  const userId = urlParams.get("userId")

  const [_state, send] = useMachine(roomSetupMachine, {
    context: {
      challenge,
      userId,
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
    send("SET_REQUIREMENTS", {
      data: {
        challenge,
        userId,
        room: {
          type: sessionStorage.getItem("createRoomType") ?? "jukebox",
          title: sessionStorage.getItem("createRoomTitle") ?? "My Room",
          radioMetaUrl:
            sessionStorage.getItem("createRoomradioMetaUrl") ?? undefined,
          radioListenUrl: sessionStorage.getItem("createRoomRadioListenUrl"),
          deputizeOnJoin:
            sessionStorage.getItem("createRoomDeputizeOnJoin") === "true",
          radioProtocol:
            (sessionStorage.getItem(
              "createRoomRadioProtocol",
            ) as StationProtocol) ?? "shoutcastv2",
        },
      },
    })
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
