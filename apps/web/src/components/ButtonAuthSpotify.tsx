// component for the button to authenticate with a music service
import React, { useEffect } from "react"
import { Link, Box, Button, IconButton, Icon, Text, HStack } from "@chakra-ui/react"
import { LuCheckCircle, LuTrash2 } from "react-icons/lu"
import { FaSpotify } from "react-icons/fa"

import {
  useCurrentUser,
  useIsAuthenticated,
  useIsMetadataSourceAuthenticated,
  useIsMetadataSourceLoading,
  useMetadataSourceAuthSend,
} from "../hooks/useActors"
import { useLocation } from "@tanstack/react-router"

export default function ButtonAuthSpotify({
  userId,
  serviceName = "spotify",
}: {
  userId?: string
  serviceName?: string
}) {
  const currentUser = useCurrentUser()
  const isAuthenticated = useIsAuthenticated()
  const isMetadataAuthenticated = useIsMetadataSourceAuthenticated()
  const isMetadataLoading = useIsMetadataSourceLoading()
  const metadataSend = useMetadataSourceAuthSend()
  const location = useLocation()

  useEffect(() => {
    if (currentUser?.userId || userId) {
      metadataSend({
        type: "INIT",
        data: {
          userId: userId ?? currentUser.userId,
          serviceName,
        },
      })
      metadataSend({ type: "FETCH_STATUS" })
    }
  }, [userId, currentUser?.userId, serviceName, metadataSend])

  function handleLogin(e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement, MouseEvent>) {
    e.preventDefault()
    e.stopPropagation()
    sessionStorage.setItem("postSpotifyAuthRedirect", location.pathname)
  }

  if (!isAuthenticated) return null

  const serviceDisplayName = serviceName.charAt(0).toUpperCase() + serviceName.slice(1)

  return (
    <Box>
      {!isMetadataAuthenticated && (
        <Button
          asChild
          onClick={handleLogin}
          loading={isMetadataLoading}
          disabled={isMetadataLoading}
        >
          <Link
            href={`${import.meta.env.VITE_API_URL}/auth/${serviceName}/login?userId=${
              userId ?? currentUser.userId
            }`}
          >
            {serviceName === "spotify" && <Icon as={FaSpotify} />}
            Link {serviceDisplayName}
          </Link>
        </Button>
      )}
      {isMetadataAuthenticated && (
        <HStack gap={2} w="100%" justify="space-between">
          <HStack gap={2}>
            <Icon as={LuCheckCircle} color="primary" />
            <Text fontSize="sm">Your {serviceDisplayName} account is linked.</Text>
          </HStack>
          <IconButton
            variant="outline"
            color="red.500"
            size="xs"
            onClick={() => metadataSend({ type: "LOGOUT" })}
            aria-label={`log out of ${serviceDisplayName}`}
          >
            <LuTrash2 />
          </IconButton>
        </HStack>
      )}
    </Box>
  )
}
