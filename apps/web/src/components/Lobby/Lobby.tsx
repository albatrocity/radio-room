import React, { useEffect } from "react"
import { Box, Button, Grid, GridItem } from "@chakra-ui/react"
import LobbyOverlays from "./LobbyOverlays"
import { useCurrentUser, useModalsSend } from "../../hooks/useActors"
import { useMachine } from "@xstate/react"
import { createdRoomsFetchMachine } from "../../machines/createdRoomsFetchMachine"
import CardRoom from "../CardRoom"
import CardsAppInfo from "../AppIntro"
import { LuPlus } from "react-icons/lu"

export default function Lobby() {
  const user = useCurrentUser()
  const modalSend = useModalsSend()

  const [state, fetchSend] = useMachine(createdRoomsFetchMachine, {
    context: {
      userId: user?.userId,
    },
  })

  async function handleRoomDelete(roomId: string) {
    return fetchSend({ type: "DELETE_ROOM", data: { roomId } })
  }

  useEffect(() => {
    if (user?.userId) {
      fetchSend({
        type: "FETCH",
        data: {
          userId: user?.userId,
        },
      })
    } else {
      fetchSend({ type: "SESSION_ENDED" })
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
        <CardsAppInfo />
        {state.context.rooms.map((room) => (
          <GridItem key={room.id}>
            <CardRoom {...room} onDelete={(id) => handleRoomDelete(id)} />
          </GridItem>
        ))}
        {state.context.rooms.length === 0 && (
          <GridItem>
            <Box>
              <Button
                onClick={() => modalSend({ type: "CREATE_ROOM" })}
              >
                <LuPlus />
                Create a Room
              </Button>
            </Box>
          </GridItem>
        )}
      </Grid>
    </Box>
  )
}
