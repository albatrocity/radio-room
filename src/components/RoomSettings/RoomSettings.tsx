import React from "react"
import { Link } from "gatsby"
import {
  Alert,
  AlertIcon,
  Box,
  Text,
  VStack,
  Link as ChakraLink,
} from "@chakra-ui/react"

import { Room, RoomSetup } from "../../types/Room"
import FormJukeboxSettings from "./FormJukeboxSettings"
import SharedSettings from "./SharedSettings"

type Props = {
  roomType: Room["type"]
  settings: RoomSetup
  onChange: (settings: Partial<RoomSetup>) => void
}

export default function RoomSettings({ settings, onChange }: Props) {
  return (
    <VStack spacing={8} w="100%">
      <SharedSettings onChange={onChange} settings={settings} />
      <FormJukeboxSettings onChange={onChange} />
      <Alert
        status="warning"
        fontSize="sm"
        color="blackAlpha.700"
        alignItems="flex-start"
      >
        <AlertIcon />
        <Box textStyle="body">
          <Text>
            <Text as="strong">
              Creating a room requires a Spotify Premium account.
            </Text>{" "}
            You will be redirected to Spotify to login and authorize this app,
            then redirected back here to finish creating your room.
          </Text>
          <Text>
            By creating a room, you agree to understanding the{" "}
            <ChakraLink href="/privacy" textDecoration="underline" isExternal>
              Privacy Policy
            </ChakraLink>
          </Text>
          <Text>
            Your room and all of its data will expire 24 hours after the last
            time you leave it. It will not expire if you are in it.
          </Text>
        </Box>
      </Alert>
    </VStack>
  )
}
