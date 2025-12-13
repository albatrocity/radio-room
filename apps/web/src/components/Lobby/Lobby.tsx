import { useEffect } from "react"
import { Box, Grid, GridItem, Text } from "@chakra-ui/react"
import { useMachine } from "@xstate/react"
import { allRoomsFetchMachine } from "../../machines/allRoomsFetchMachine"
import CardRoomPublic from "../CardRoomPublic"

export default function Lobby() {
  const [state, fetchSend] = useMachine(allRoomsFetchMachine)

  useEffect(() => {
    fetchSend({ type: "FETCH" })
  }, [fetchSend])

  return (
    <Box>
      <Grid
        my={4}
        templateColumns={["repeat(1, 1fr)", "repeat(2, 1fr)", "repeat(3, 1fr)", "repeat(4, 1fr)"]}
        gap={6}
      >
        {state.context.rooms.map((room) => (
          <GridItem key={room.id}>
            <CardRoomPublic {...room} />
          </GridItem>
        ))}
        {state.context.rooms.length === 0 && state.matches("success") && (
          <GridItem>
            <Box>
              <Text>No rooms are currently available.</Text>
            </Box>
          </GridItem>
        )}
      </Grid>
    </Box>
  )
}
