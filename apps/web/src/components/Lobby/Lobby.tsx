import React, { useEffect } from "react"
import { Box, Button, Grid, GridItem } from "@chakra-ui/react"
import LobbyOverlays from "./LobbyOverlays"
import { useCurrentUser } from "../../state/authStore"
import { useMachine } from "@xstate/react"
import { createdRoomsFetchMachine } from "../../machines/createdRoomsFetchMachine"
import CardRoom from "../CardRoom"
import CardsAppInfo from "../AppIntro"
import { AddIcon } from "@chakra-ui/icons"
import { useModalsStore } from "../../state/modalsState"

export default function Lobby() {
  const user = useCurrentUser()
  const { send: modalSend } = useModalsStore()

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
      fetchSend("FETCH", {
        data: {
          userId: user?.userId,
        },
      })
    } else {
      fetchSend("SESSION_ENDED")
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
                leftIcon={<AddIcon />}
                onClick={() => modalSend("CREATE_ROOM")}
              >
                Create a Room
              </Button>
            </Box>
          </GridItem>
        )}
      </Grid>
    </Box>
  )
}
