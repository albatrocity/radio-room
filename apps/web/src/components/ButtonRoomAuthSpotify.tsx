// component for the button to authenticate with Spotify (or other metadata sources)
import React, { useEffect, useState } from "react"
import { useLocation } from "@tanstack/react-router"
import { Link, Box, Button, Icon, Text, HStack, VStack, Spinner } from "@chakra-ui/react"
import { LuCheck, LuMusic } from "react-icons/lu"

import {
  useCurrentRoom,
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
  const room = useCurrentRoom()
  const location = useLocation()
  const isAuthenticated = useIsMetadataSourceAuthenticated()
  const isLoading = useIsMetadataSourceLoading()
  const metadataSend = useMetadataSourceAuthSend()
  const [loadTimedOut, setLoadTimedOut] = useState(false)

  // Playback and search use the room creator's tokens (ADR 0012 / 0078).
  const statusUserId = room?.creator ?? currentUser?.userId

  useEffect(() => {
    if (!isLoading) {
      setLoadTimedOut(false)
      return
    }
    const timeout = window.setTimeout(() => setLoadTimedOut(true), 3000)
    return () => window.clearTimeout(timeout)
  }, [isLoading])

  useEffect(() => {
    if (statusUserId) {
      sessionStorage.setItem("postSpotifyAuthRedirect", location.pathname)
      metadataSend({
        type: "INIT",
        data: {
          userId: statusUserId,
          serviceName,
        },
      })
      metadataSend({ type: "FETCH_STATUS" })
    }
  }, [statusUserId, serviceName, metadataSend, location.pathname])

  const serviceDisplayName = serviceName.charAt(0).toUpperCase() + serviceName.slice(1)
  const showLink = forceRelink || ((!isLoading || loadTimedOut) && !isAuthenticated)
  const loginHref = `${getApiBaseUrl()}/auth/${serviceName}/login?userId=${
    currentUser?.userId ?? ""
  }&redirect=${encodeURIComponent(location.pathname)}${
    room?.id ? `&roomId=${encodeURIComponent(room.id)}` : ""
  }`
  const needsPlayback =
    room?.playbackControllerId === "bridge" || room?.playbackControllerId === "spotify"

  return (
    <Box>
      {isLoading && !forceRelink && <Spinner size="sm" />}
      {showLink && (
        <VStack align="flex-start">
          <Button asChild size="sm" colorPalette="action">
            <Link href={loginHref}>
              {serviceName === "spotify" && <Icon as={LuMusic} />}
              {forceRelink || isAuthenticated ? `Re-link ${serviceDisplayName}` : `Link ${serviceDisplayName}`}
            </Link>
          </Button>
          {!hideText && (
            <Text fontSize="sm" mt={2} color="fg.muted">
              {forceRelink
                ? `Your ${serviceDisplayName} session expired. Re-link to search, browse, and play again.`
                : needsPlayback
                  ? `Link ${serviceDisplayName} to this room so playback and catalog search can refresh access.`
                  : `Link your ${serviceDisplayName} account to pull artwork and release info`}
            </Text>
          )}
        </VStack>
      )}
      {!forceRelink && !isLoading && isAuthenticated && (
        <VStack align="flex-start" gap={2}>
          <HStack gap={2}>
            <Icon as={LuCheck} color="primary" _dark={{ color: "secondaryText" }} />
            <Text fontSize="sm">Your {serviceDisplayName} account is linked to this room.</Text>
          </HStack>
          <Button asChild size="sm" variant="outline">
            <Link href={loginHref}>Re-link {serviceDisplayName}</Link>
          </Button>
          {!hideText && (
            <Text fontSize="sm" color="fg.muted">
              Re-link if playback or catalog search stops working.
            </Text>
          )}
        </VStack>
      )}
    </Box>
  )
}
