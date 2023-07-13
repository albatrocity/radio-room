// component for the button to authenticate with Spotify
import React, { useEffect } from "react"
import { useLocation } from "@reach/router"
import {
  Link,
  Box,
  Button,
  Icon,
  Text,
  HStack,
  VStack,
  Spinner,
} from "@chakra-ui/react"
import { CheckCircleIcon } from "@chakra-ui/icons"
import { FaSpotify } from "react-icons/fa"

import { useAppSpotifyAuthStore } from "../state/appSpotifyAuthStore"
import { useCurrentUser } from "../state/authStore"

export default function ButtonRoomAuthSpotify({
  hideText = false,
}: {
  hideText?: boolean
}) {
  const currentUser = useCurrentUser()
  const location = useLocation()
  const { state, send } = useAppSpotifyAuthStore()

  useEffect(() => {
    sessionStorage.setItem("postSpotifyAuthRedirect", location.pathname)
    send("FETCH_STATUS")
  }, [])

  return (
    <Box>
      {state.matches("loading") && <Spinner size="sm" />}
      {state.matches("unauthenticated") && (
        <VStack align="flex-start">
          <Button
            as={Link}
            href={`${process.env.GATSBY_API_URL}/login?userId=${currentUser.userId}&redirect=/callback`}
            leftIcon={<Icon as={FaSpotify} />}
            isLoading={state.matches("working")}
            isDisabled={state.matches("working")}
          >
            Link Spotify
          </Button>
          {!hideText && (
            <Text fontSize="sm" mt={2} color="blackAlpha.700">
              Link your Spotify account to pull artwork and release info from
              Spotify
            </Text>
          )}
        </VStack>
      )}
      {state.matches("authenticated") && (
        <HStack spacing={2}>
          <CheckCircleIcon color="primary" />
          <Text fontSize="sm">
            Your Spotify account is linked to this room.
          </Text>
        </HStack>
      )}
    </Box>
  )
}
