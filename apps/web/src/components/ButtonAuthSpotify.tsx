// component for the button to authenticate with Spotify
import React from "react"
import { Link, Box, Button, IconButton, Icon, Text, HStack } from "@chakra-ui/react"
import { CheckCircleIcon, DeleteIcon } from "@chakra-ui/icons"
import { FaSpotify } from "react-icons/fa"

import { useCurrentUser, useIsAdmin, useIsAuthenticated } from "../state/authStore"
import { useSpotifyAuthStore } from "../state/spotifyAuthStore"
import { useLocation } from "@reach/router"

export default function ButtonAuthSpotify({ userId }: { userId?: string }) {
  const currentUser = useCurrentUser()
  const isAuthenticated = useIsAuthenticated()
  const isAdmin = useIsAdmin()
  const { state, send } = useSpotifyAuthStore()
  const location = useLocation()

  function handleLogin(e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement, MouseEvent>) {
    e.preventDefault()
    e.stopPropagation()
    if (!isAdmin) {
      sessionStorage.setItem("postSpotifyAuthRedirect", location.pathname)
      send("GENERATE_LOGIN_URL")
    }
  }

  if (!isAuthenticated) return null

  return (
    <Box>
      {!state.matches("authenticated") && (
        <Button
          as={isAdmin ? Link : undefined}
          href={
            isAdmin
              ? `${process.env.GATSBY_API_URL}/auth/spotify/login?userId=${
                  userId ?? currentUser.userId
                }`
              : undefined
          }
          onClick={handleLogin}
          leftIcon={<Icon as={FaSpotify} />}
          isLoading={state.matches("working")}
          isDisabled={state.matches("working")}
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
