import { Box, Center, HStack, Text } from "@chakra-ui/react"
import React from "react"
import { getErrorMessage } from "../lib/errors"
import { useIsAdmin } from "../state/authStore"
import { useCurrentRoom } from "../state/roomStore"
import ButtonRoomAuthSpotify from "./ButtonRoomAuthSpotify"

export default function RoomError() {
  const room = useCurrentRoom()
  const isAdmin = useIsAdmin()
  if (!room?.spotifyError) {
    return null
  }
  return (
    <Box bg="red.500" p={2}>
      <Center>
        <HStack>
          <Text>{getErrorMessage(room.spotifyError)}</Text>
          {room.spotifyError?.status === 401 && isAdmin && (
            <ButtonRoomAuthSpotify hideText />
          )}
        </HStack>
      </Center>
    </Box>
  )
}
