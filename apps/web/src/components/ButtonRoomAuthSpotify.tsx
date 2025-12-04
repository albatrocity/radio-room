// component for the button to authenticate with Spotify (or other metadata sources)
import React, { useEffect } from "react"
import { useLocation } from "@tanstack/react-router"
import { Link, Box, Button, Icon, Text, HStack, VStack, Spinner } from "@chakra-ui/react"
import { LuCheckCircle } from "react-icons/lu"
import { FaSpotify } from "react-icons/fa"

import { useMetadataSourceAuthStore } from "../state/metadataSourceAuthStore"
import { useCurrentUser } from "../state/authStore"

export default function ButtonRoomAuthSpotify({
  hideText = false,
  serviceName = "spotify",
}: {
  hideText?: boolean
  serviceName?: string
}) {
  const currentUser = useCurrentUser()
  const location = useLocation()
  const { state, send } = useMetadataSourceAuthStore()

  useEffect(() => {
    if (currentUser?.userId) {
      sessionStorage.setItem("postSpotifyAuthRedirect", location.pathname)
      send("INIT", {
        data: {
          userId: currentUser.userId,
          serviceName,
        },
      })
      send("FETCH_STATUS")
    }
  }, [currentUser?.userId, serviceName, send, location.pathname])

  const serviceDisplayName = serviceName.charAt(0).toUpperCase() + serviceName.slice(1)

  return (
    <Box>
      {state.matches("loading") && <Spinner size="sm" />}
      {state.matches("unauthenticated") && (
        <VStack align="flex-start">
          <Button
            asChild
            loading={state.matches("working")}
            disabled={state.matches("working")}
          >
            <Link
              href={`${import.meta.env.VITE_API_URL}/auth/${serviceName}/login?userId=${
                currentUser.userId
              }&redirect=/callback`}
            >
              {serviceName === "spotify" && <Icon as={FaSpotify} />}
              Link {serviceDisplayName}
            </Link>
          </Button>
          {!hideText && (
            <Text fontSize="sm" mt={2} color="blackAlpha.700">
              Link your {serviceDisplayName} account to pull artwork and release info
            </Text>
          )}
        </VStack>
      )}
      {state.matches("authenticated") && (
        <HStack gap={2}>
          <Icon as={LuCheckCircle} color="primary" _dark={{ color: "secondaryText" }} />
          <Text fontSize="sm">Your {serviceDisplayName} account is linked to this room.</Text>
        </HStack>
      )}
    </Box>
  )
}
