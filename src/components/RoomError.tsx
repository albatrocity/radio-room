import { Alert, AlertIcon, Box, HStack, Link, Text } from "@chakra-ui/react"
import { Link as GatsbyLink } from "gatsby"
import React from "react"
import { getErrorMessage } from "../lib/errors"
import { useIsAdmin } from "../state/authStore"
import { useCurrentRoom, useRoomError } from "../state/roomStore"
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
      <Alert status="error">
        <AlertIcon />
        {error && (
          <HStack>
            <Text>{errorMessage}</Text>
            {error?.status === 401 && isAdmin && (
              <ButtonRoomAuthSpotify hideText />
            )}
            {error?.status === 404 && (
              <Text>
                Try{" "}
                <Link textDecoration="underline" as={GatsbyLink} to="/">
                  creating a room of your own
                </Link>
                .
              </Text>
            )}
          </HStack>
        )}
      </Alert>
    </Box>
  )
}
