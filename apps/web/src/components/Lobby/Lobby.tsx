import { useEffect, useMemo } from "react"
import { Box, Grid, GridItem, Text, Spinner, VStack, Link, Container } from "@chakra-ui/react"
import { Link as RouterLink } from "@tanstack/react-router"
import {
  useLobbyRooms,
  useIsLobbyLoading,
  useIsLobbyReady,
  useLobbySend,
  usePreferredMetadataSource,
} from "../../hooks/useActors"
import { getNextShowTime } from "../../lib/dates"
import { setCurrentArtworkUrl } from "../../hooks/useDynamicTheme"
import { Logo } from "../ui/logo"
import { LobbyRoom } from "../../machines/lobbyMachine"
import RoomPublicMeta from "../RoomPublicMeta"

export default function Lobby() {
  const rooms = useLobbyRooms()
  const isLoading = useIsLobbyLoading()
  const send = useLobbySend()
  const preferredSource = usePreferredMetadataSource()
  const room = rooms[0]

  const artworkUrl = useMemo(() => {
    if (!room?.nowPlaying) return undefined
    const item = room.nowPlaying
    const track =
      preferredSource && item.metadataSources?.[preferredSource]
        ? item.metadataSources[preferredSource]!.track
        : item.track
    return track.album?.images?.find((img) => img.type === "image" && img.url)?.url
  }, [room?.nowPlaying, preferredSource])

  useEffect(() => {
    setCurrentArtworkUrl(artworkUrl ?? null)
    return () => setCurrentArtworkUrl(null)
  }, [artworkUrl])

  // Connect to lobby on mount, disconnect on unmount
  useEffect(() => {
    send({ type: "CONNECT" })
    return () => {
      send({ type: "DISCONNECT" })
    }
  }, [send])

  return (
    <Container h="100%" maxW="xl">
      <Grid templateRows="1fr auto" gap={4} className="lobby-container" h="100%">
        <GridItem width="fit-content" flexGrow={1} h="100%" w="100%">
          <VStack h="100%" w="100%">
            <Box
              flex="1"
              minH={0}
              w="100%"
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              <RouterLink
                to="/rooms/$roomId"
                params={{ roomId: room?.id }}
                style={{
                  display: "flex",
                  height: "100%",
                  maxWidth: "100%",
                  textAlign: "center",
                }}
              >
                <Logo
                  primaryColor="black"
                  secondaryColor="action.solid"
                  h="100%"
                  w="auto"
                  artworkUrl={artworkUrl}
                />
              </RouterLink>
            </Box>
            {isLoading ? <Spinner /> : <LobbyContent room={room} />}
          </VStack>
        </GridItem>
      </Grid>
    </Container>
  )
}

function LobbyContent({ room }: { room: LobbyRoom | undefined }) {
  const nextShowTime = useMemo(() => {
    return getNextShowTime(new Date())
  }, [])
  const isReady = useIsLobbyReady()

  return (
    <Box colorPalette="action">
      {!room && isReady && (
        <Text>
          Listening Room is offline. The next show is {nextShowTime}. Check out the{" "}
          <Link textDecoration="underline" href="https://archive.listeningroom.club">
            archive
          </Link>{" "}
          for past shows.
        </Text>
      )}
      {room && <RoomPublicMeta {...room} />}
    </Box>
  )
}
