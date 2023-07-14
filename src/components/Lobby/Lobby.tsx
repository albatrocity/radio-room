import React, { useEffect } from "react"
import { Box, Button, Grid, Heading, HStack, GridItem } from "@chakra-ui/react"
import { useModalsStore } from "../../state/modalsState"
import LobbyOverlays from "./LobbyOverlays"
import { useCurrentUser } from "../../state/authStore"
import { useMachine } from "@xstate/react"
import { createdRoomsFetchMachine } from "../../machines/createdRoomsFetchMachine"
import { AddIcon } from "@chakra-ui/icons"
import CardRoom from "../CardRoom"

export default function Lobby() {
  const { send } = useModalsStore()
  const user = useCurrentUser()

  const [state, fetchSend] = useMachine(createdRoomsFetchMachine, {
    context: {
      userId: user.userId,
    },
  })

  async function handleRoomDelete(roomId: string) {
    return fetchSend("DELETE_ROOM", { data: { roomId } })
  }

  useEffect(() => {
    fetchSend("FETCH")
  }, [user.userId])

  return (
    <Box>
      <HStack w="100%" justifyContent="space-between">
        <Heading>Rooms</Heading>
        <Button leftIcon={<AddIcon />} onClick={() => send("CREATE_ROOM")}>
          Create a Room
        </Button>
      </HStack>
      <Grid
        my={4}
        templateColumns={[
          "repeat(1, 1fr)",
          "repeat(2, 1fr)",
          "repeat(3, 1fr)",
          "repeat(4, 1fr)",
        ]}
        gap={6}
      >
        {state.context.rooms.map((room) => (
          <GridItem key={room.id}>
            <CardRoom {...room} onDelete={(id) => handleRoomDelete(id)} />
          </GridItem>
        ))}
      </Grid>
      <LobbyOverlays />
    </Box>
  )
}
