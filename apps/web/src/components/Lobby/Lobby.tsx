import { useEffect } from "react"
import { Box, Grid, GridItem, Text, Spinner, VStack } from "@chakra-ui/react"
import {
  useLobbyRooms,
  useIsLobbyLoading,
  useIsLobbyReady,
  useLobbySend,
} from "../../hooks/useActors"
import CardRoomPublic from "../CardRoomPublic"

export default function Lobby() {
  const rooms = useLobbyRooms()
  const isLoading = useIsLobbyLoading()
  const isReady = useIsLobbyReady()
  const send = useLobbySend()

  // Connect to lobby on mount, disconnect on unmount
  useEffect(() => {
    send({ type: "CONNECT" })
    return () => {
      send({ type: "DISCONNECT" })
    }
  }, [send])

  if (isLoading) {
    return (
      <Box my={4}>
        <VStack>
          <Spinner />
          <Text>Loading rooms...</Text>
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
        {rooms.map((room) => (
          <GridItem key={room.id}>
            <CardRoomPublic {...room} />
          </GridItem>
        ))}
        {rooms.length === 0 && isReady && (
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
