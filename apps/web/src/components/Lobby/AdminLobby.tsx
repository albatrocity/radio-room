import { useEffect } from "react"
import { Box, Button, Grid, GridItem, Text, Spinner, VStack } from "@chakra-ui/react"
import { useCurrentUser, useModalsSend } from "../../hooks/useActors"
import { useMachine } from "@xstate/react"
import { createdRoomsFetchMachine } from "../../machines/createdRoomsFetchMachine"
import CardRoom from "../CardRoom"
import { LuPlus } from "react-icons/lu"

export default function AdminLobby() {
  const user = useCurrentUser()
  const modalSend = useModalsSend()

  const [state, fetchSend] = useMachine(createdRoomsFetchMachine)

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
  }, [user?.userId, fetchSend])

  // Show message if not logged in
  if (!user?.userId) {
    return (
      <Box my={4}>
        <Text>Please log in with Spotify to manage your rooms.</Text>
      </Box>
    )
  }

  // Show loading state
  if (state.matches("loading")) {
    return (
      <Box my={4}>
        <VStack>
          <Spinner />
          <Text>Loading your rooms...</Text>
        </VStack>
      </Box>
    )
  }

  return (
    <Box>
      <Grid
        my={4}
        templateColumns={["repeat(1, 1fr)", "repeat(2, 1fr)", "repeat(3, 1fr)", "repeat(4, 1fr)"]}
        gap={6}
      >
        {state.context.rooms.map((room) => (
          <GridItem key={room.id}>
            <CardRoom {...room} onDelete={(id) => handleRoomDelete(id)} />
          </GridItem>
        ))}
        <GridItem>
          <Box>
            <Button onClick={() => modalSend({ type: "CREATE_ROOM" })}>
              <LuPlus />
              Create a Room
            </Button>
          </Box>
        </GridItem>
      </Grid>
    </Box>
  )
}
