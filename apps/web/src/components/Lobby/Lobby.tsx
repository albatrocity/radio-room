import { useEffect, useMemo } from "react"
import { Box, Grid, GridItem, Text, Spinner, VStack, Link } from "@chakra-ui/react"
import {
  useLobbyRooms,
  useIsLobbyLoading,
  useIsLobbyReady,
  useLobbySend,
} from "../../hooks/useActors"
import CardRoomPublic from "../CardRoomPublic"
import { getNextShowTime } from "../../lib/dates"

export default function Lobby() {
  const rooms = useLobbyRooms()
  const isLoading = useIsLobbyLoading()
  const isReady = useIsLobbyReady()
  const send = useLobbySend()

  const nextShowTime = useMemo(() => {
    return getNextShowTime(new Date())
  }, [])

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
      {rooms.length === 0 && isReady && (
        <GridItem>
          <Box>
            <Text>
              Listening Room is offline. The next show is {nextShowTime}. Check out the{" "}
              <Link textDecoration="underline" href="https://archive.listeningroom.club">
                archive
              </Link>{" "}
              for past shows.
            </Text>
          </Box>
        </GridItem>
      )}
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
      </Grid>
    </Box>
  )
}
