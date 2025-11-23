// component for the button to authenticate with a music service
import React, { useEffect } from "react"
import { Link, Box, Button, IconButton, Icon, Text, HStack } from "@chakra-ui/react"
import { CheckCircleIcon, DeleteIcon } from "@chakra-ui/icons"
import { FaSpotify } from "react-icons/fa"

import { useCurrentUser, useIsAuthenticated } from "../state/authStore"
import { useMetadataSourceAuthStore } from "../state/metadataSourceAuthStore"
import { useLocation } from "@reach/router"

export default function ButtonAuthSpotify({ 
  userId,
  serviceName = "spotify"
}: { 
  userId?: string
  serviceName?: string
}) {
  const currentUser = useCurrentUser()
  const isAuthenticated = useIsAuthenticated()
  const { state, send } = useMetadataSourceAuthStore()
  const location = useLocation()
  
  useEffect(() => {
    if (currentUser?.userId || userId) {
      send("INIT", {
        data: {
          userId: userId ?? currentUser.userId,
          serviceName,
        },
      })
      send("FETCH_STATUS")
    }
  }, [userId, currentUser?.userId, serviceName, send])

  function handleLogin(e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement, MouseEvent>) {
    e.preventDefault()
    e.stopPropagation()
    sessionStorage.setItem("postSpotifyAuthRedirect", location.pathname)
  }

  if (!isAuthenticated) return null

  const serviceDisplayName = serviceName.charAt(0).toUpperCase() + serviceName.slice(1)

  return (
    <Box>
      {!state.matches("authenticated") && (
        <Button
          as={Link}
          href={`${process.env.GATSBY_API_URL}/auth/${serviceName}/login?userId=${
            userId ?? currentUser.userId
          }`}
          onClick={handleLogin}
          leftIcon={serviceName === "spotify" ? <Icon as={FaSpotify} /> : undefined}
          isLoading={state.matches("loading")}
          isDisabled={state.matches("loading")}
        >
          Link {serviceDisplayName}
        </Button>
      )}
      {state.matches("authenticated") && (
        <HStack spacing={2} w="100%" justify="space-between">
          <HStack spacing={2}>
            <CheckCircleIcon color="primary" />
            <Text fontSize="sm">Your {serviceDisplayName} account is linked.</Text>
          </HStack>
          <IconButton
            icon={<DeleteIcon />}
            variant="outline"
            color="red.500"
            size="xs"
            onClick={() => send("LOGOUT")}
            aria-label={`log out of ${serviceDisplayName}`}
          >
            Log out
          </IconButton>
        </HStack>
      )}
    </Box>
  )
}
