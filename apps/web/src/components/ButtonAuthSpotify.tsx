// component for the button to authenticate with Spotify
import React from "react"
import { Link, Box, Button, IconButton, Icon, Text, HStack } from "@chakra-ui/react"
import { CheckCircleIcon, DeleteIcon } from "@chakra-ui/icons"
import { FaSpotify } from "react-icons/fa"

import { useCurrentUser, useIsAuthenticated } from "../state/authStore"
import { useRoomSpotifyAuthStore } from "../state/roomSpotifyAuthStore"
import { useLocation } from "@reach/router"

export default function ButtonAuthSpotify({ userId }: { userId?: string }) {
  const currentUser = useCurrentUser()
  const isAuthenticated = useIsAuthenticated()
  const { state, send } = useRoomSpotifyAuthStore()
  const location = useLocation()

  function handleLogin(e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement, MouseEvent>) {
    e.preventDefault()
    e.stopPropagation()
    sessionStorage.setItem("postSpotifyAuthRedirect", location.pathname)
  }

  if (!isAuthenticated) return null

  return (
    <Box>
      {!state.matches("authenticated") && (
        <Button
          as={Link}
          href={`${process.env.GATSBY_API_URL}/auth/spotify/login?userId=${
            userId ?? currentUser.userId
          }`}
          onClick={handleLogin}
          leftIcon={<Icon as={FaSpotify} />}
          isLoading={state.matches("loading")}
          isDisabled={state.matches("loading")}
        >
          Link Spotify
        </Button>
      )}
      {state.matches("authenticated") && (
        <HStack spacing={2} w="100%" justify="space-between">
          <HStack spacing={2}>
            <CheckCircleIcon color="primary" />
            <Text fontSize="sm">Your Spotify account is linked.</Text>
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
