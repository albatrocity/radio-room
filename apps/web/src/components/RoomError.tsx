import { Alert, Box, HStack, Link, Text } from "@chakra-ui/react"
import { Link as TanStackLink } from "@tanstack/react-router"
import React from "react"
import { getErrorMessage } from "../lib/errors"
import { useIsAdmin, useCurrentRoom, useRoomError } from "../hooks/useActors"
import ButtonRoomAuthSpotify from "./ButtonRoomAuthSpotify"

export default function RoomError() {
  const room = useCurrentRoom()
  const roomError = useRoomError()
  const isAdmin = useIsAdmin()

  if (!room?.spotifyError && !roomError && !room?.radioError) {
    return null
  }
  const error = room?.spotifyError ?? roomError ?? room?.radioError

  const errorMessage = room?.spotifyError
    ? getErrorMessage(room.spotifyError, isAdmin)
    : error?.message

  return (
    <Box bg={isAdmin ? "critical" : "secondaryBg"} p={2}>
      <Alert.Root status="error">
        <Alert.Indicator />
        {error && (
          <HStack>
            <Text>{errorMessage}</Text>
            {error?.status === 401 && isAdmin && <ButtonRoomAuthSpotify hideText />}
            {error?.status === 404 && (
              <Text>
                Try{" "}
                <Link asChild textDecoration="underline">
                  <TanStackLink to="/">creating a room of your own</TanStackLink>
                </Link>
                .
              </Text>
            )}
          </HStack>
        )}
      </Alert.Root>
    </Box>
  )
}
