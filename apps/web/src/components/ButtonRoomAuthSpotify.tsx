// component for the button to authenticate with Spotify (or other metadata sources)
import React, { useEffect } from "react"
import { useLocation } from "@tanstack/react-router"
import { Link, Box, Button, Icon, Text, HStack, VStack, Spinner } from "@chakra-ui/react"
import { LuCheck, LuMusic } from "react-icons/lu"

import {
  useCurrentUser,
  useIsMetadataSourceAuthenticated,
  useIsMetadataSourceLoading,
  useMetadataSourceAuthSend,
} from "../hooks/useActors"
import { getApiBaseUrl } from "../lib/apiBaseUrl"

export default function ButtonRoomAuthSpotify({
  hideText = false,
  serviceName = "spotify",
  /** Show link CTA even when status says authenticated (e.g. expired token mid-session). */
  forceRelink = false,
}: {
  hideText?: boolean
  serviceName?: string
  forceRelink?: boolean
}) {
  const currentUser = useCurrentUser()
  const location = useLocation()
  const isAuthenticated = useIsMetadataSourceAuthenticated()
  const isLoading = useIsMetadataSourceLoading()
  const metadataSend = useMetadataSourceAuthSend()

  useEffect(() => {
    if (currentUser?.userId) {
      sessionStorage.setItem("postSpotifyAuthRedirect", location.pathname)
      metadataSend({
        type: "INIT",
        data: {
          userId: currentUser.userId,
          serviceName,
        },
      })
      metadataSend({ type: "FETCH_STATUS" })
    }
  }, [currentUser?.userId, serviceName, metadataSend, location.pathname])

  const serviceDisplayName = serviceName.charAt(0).toUpperCase() + serviceName.slice(1)
  const showLink = forceRelink || (!isLoading && !isAuthenticated)

  return (
    <Box>
      {isLoading && !forceRelink && <Spinner size="sm" />}
      {showLink && (
        <VStack align="flex-start">
          <Button asChild size="sm" colorPalette="action">
            <Link
              href={`${getApiBaseUrl()}/auth/${serviceName}/login?userId=${
                currentUser?.userId
              }&redirect=${encodeURIComponent(location.pathname)}`}
            >
              {serviceName === "spotify" && <Icon as={LuMusic} />}
              {forceRelink || isAuthenticated ? `Re-link ${serviceDisplayName}` : `Link ${serviceDisplayName}`}
            </Link>
          </Button>
          {!hideText && (
            <Text fontSize="sm" mt={2} color="fg.muted">
              {forceRelink
                ? `Your ${serviceDisplayName} session expired. Re-link to search and browse again.`
                : `Link your ${serviceDisplayName} account to pull artwork and release info`}
            </Text>
          )}
        </VStack>
      )}
      {!forceRelink && !isLoading && isAuthenticated && (
        <HStack gap={2}>
          <Icon as={LuCheck} color="primary" _dark={{ color: "secondaryText" }} />
          <Text fontSize="sm">Your {serviceDisplayName} account is linked to this room.</Text>
        </HStack>
      )}
    </Box>
  )
}
