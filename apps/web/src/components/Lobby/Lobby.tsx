import { useCallback, useEffect, useMemo, useRef } from "react"
import { Box, Grid, GridItem, Text, Spinner, VStack, Link, Container } from "@chakra-ui/react"
import { Link as RouterLink, useNavigate } from "@tanstack/react-router"
import {
  useLobbyRooms,
  useIsLobbyLoading,
  useIsLobbyReady,
  useLobbySend,
  usePreferredMetadataSource,
} from "../../hooks/useActors"
import { useAnimationsEnabled } from "../../hooks/useReducedMotion"
import { getNextShowTime } from "../../lib/dates"
import { setCurrentArtworkUrl } from "../../hooks/useDynamicTheme"
import { Logo } from "../ui/logo"
import { LobbyRoom } from "../../machines/lobbyMachine"
import RoomPublicMeta from "../RoomPublicMeta"
import { initializeRoom } from "../../actors/roomLifecycle"

export default function Lobby() {
  const rooms = useLobbyRooms()
  const isLoading = useIsLobbyLoading()
  const send = useLobbySend()
  const preferredSource = usePreferredMetadataSource()
  const room = rooms[0]
  const navigate = useNavigate()
  const animationsEnabled = useAnimationsEnabled()
  const transitioningRef = useRef(false)

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

  const handleJoin = useCallback(
    (roomId: string | undefined) => {
      if (!roomId || transitioningRef.current) return
      initializeRoom(roomId) // warm socket/fetch/auth so the room is populated sooner
      transitioningRef.current = true
      void navigate({
        to: "/rooms/$roomId",
        params: { roomId },
        viewTransition: animationsEnabled, // true -> startViewTransition; false -> plain nav
      })
    },
    [animationsEnabled, navigate],
  )

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
              overflow="visible"
            >
              {room?.id ? (
                <RouterLink
                  to="/rooms/$roomId"
                  params={{ roomId: room.id }}
                  onClick={(e) => {
                    e.preventDefault()
                    handleJoin(room.id)
                  }}
                  style={{
                    display: "flex",
                    height: "100%",
                    maxWidth: "100%",
                    textAlign: "center",
                  }}
                >
                  <Box className="room-hero-logo" h="100%" display="flex" maxW="100%">
                    <Logo
                      primaryColor="black"
                      secondaryColor="action.solid"
                      h="100%"
                      w="auto"
                      artworkUrl={artworkUrl}
                    />
                  </Box>
                </RouterLink>
              ) : (
                <Box className="room-hero-logo" h="100%" display="flex" maxW="100%">
                  <Logo
                    primaryColor="black"
                    secondaryColor="action.solid"
                    h="100%"
                    w="auto"
                    artworkUrl={artworkUrl}
                  />
                </Box>
              )}
            </Box>
            {isLoading ? (
              <Spinner />
            ) : (
              <LobbyContent room={room} onJoin={() => handleJoin(room?.id)} />
            )}
          </VStack>
        </GridItem>
      </Grid>
    </Container>
  )
}

function LobbyContent({
  room,
  onJoin,
}: {
  room: LobbyRoom | undefined
  onJoin: () => void
}) {
  const nextShowTime = useMemo(() => {
    return getNextShowTime(new Date())
  }, [])
  const isReady = useIsLobbyReady()

  return (
    <Box colorPalette="action">
      {!room && isReady && (
        <Text color="colorPalette.subtle" textAlign="center">
          Listening Room is offline. The next show is {nextShowTime}. Check out the{" "}
          <Link
            textDecoration="underline"
            color="colorPalette.emphasized"
            href="https://archive.listeningroom.club"
          >
            archive
          </Link>{" "}
          for past shows.
        </Text>
      )}
      {room && <RoomPublicMeta {...room} onJoin={onJoin} />}
    </Box>
  )
}
