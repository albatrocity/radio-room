import React, { useEffect } from "react"
import { Box, Grid, GridItem } from "@chakra-ui/react"
import LobbyOverlays from "./LobbyOverlays"
import { useCurrentUser } from "../../state/authStore"
import { useMachine } from "@xstate/react"
import { createdRoomsFetchMachine } from "../../machines/createdRoomsFetchMachine"
import CardRoom from "../CardRoom"

export default function Lobby() {
  const user = useCurrentUser()

  const [state, fetchSend] = useMachine(createdRoomsFetchMachine, {
    context: {
      userId: user?.userId,
    },
  })

  async function handleRoomDelete(roomId: string) {
    return fetchSend("DELETE_ROOM", { data: { roomId } })
  }

  useEffect(() => {
    if (user?.userId) {
      fetchSend("FETCH")
    }
  }, [user?.userId])

  return (
    <Box>
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
