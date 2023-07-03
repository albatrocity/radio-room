// component for the button to authenticate with Spotify
import React from "react"
import {
  Link,
  Box,
  Button,
  Icon,
  Text,
  HStack,
  IconButton,
  VStack,
} from "@chakra-ui/react"
import { CheckCircleIcon, DeleteIcon } from "@chakra-ui/icons"
import { FaSpotify } from "react-icons/fa"

import { useAppSpotifyAuthStore } from "../state/appSpotifyAuthStore"

export default function ButtonAuthSpotify() {
  const { state, send } = useAppSpotifyAuthStore()

  return (
    <Box>
      {!state.matches("authenticated") && (
        <VStack align="flex-start">
          <Button
            as={Link}
            href={`${process.env.GATSBY_API_URL}/login?userId=app`}
            leftIcon={<Icon as={FaSpotify} />}
            isLoading={state.matches("working")}
            isDisabled={state.matches("working")}
          >
            Link Spotify
          </Button>
          <Text fontSize="sm" mt={2} color="blackAlpha.700">
            Link your Spotify account to pull artwork and release info from
            Spotify
          </Text>
        </VStack>
      )}
      {state.matches("authenticated") && (
        <HStack spacing={2} w="100%" justify="space-between">
          <HStack spacing={2}>
            <CheckCircleIcon color="primary" />
            <Text fontSize="sm">
              Your Spotify account is linked to the application.
            </Text>
          </HStack>
          <IconButton
            icon={<DeleteIcon />}
            variant="outline"
            color="red.500"
            size="xs"
            onClick={() => send("LOGOUT")}
            aria-label="log out of Spotify"
          >
            Log out
          </IconButton>
        </HStack>
      )}
    </Box>
  )
}
