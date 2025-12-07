import React, { useEffect, useState, useCallback } from "react"
import { useLocation } from "@tanstack/react-router"
import { Link, Box, Button, Icon, Text, HStack, VStack, Spinner } from "@chakra-ui/react"
import { LuCheckCircle, LuPlus, LuUnlink } from "react-icons/lu"
import { SiTidal } from "react-icons/si"

import { useCurrentUser, useCurrentRoom } from "../hooks/useActors"
import { emitToSocket, subscribeById, unsubscribeById } from "../actors"

export default function ButtonRoomAuthTidal({ hideText = false }: { hideText?: boolean }) {
  const currentUser = useCurrentUser()
  const room = useCurrentRoom()
  const location = useLocation()
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isEnabling, setIsEnabling] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)

  // Check if Tidal is already enabled as a metadata source for this room
  const isTidalEnabled = room?.metadataSourceIds?.includes("tidal") ?? false

  const handleEvent = useCallback((event: { type: string; data?: any }) => {
    if (event.type === "SERVICE_AUTHENTICATION_STATUS" && event.data) {
      // Only handle Tidal responses (we check by comparing with what we requested)
      setIsAuthenticated(event.data.isAuthenticated)
      setIsLoading(false)
      setIsDisconnecting(false)
    }
    if (event.type === "ROOM_SETTINGS_UPDATED") {
      setIsEnabling(false)
    }
  }, [])

  useEffect(() => {
    // Subscribe to socket events
    const subscriptionId = `tidal-auth-${Date.now()}`
    subscribeById(subscriptionId, { send: handleEvent })

    return () => {
      unsubscribeById(subscriptionId)
    }
  }, [handleEvent])

  useEffect(() => {
    if (currentUser?.userId) {
      sessionStorage.setItem("postTidalAuthRedirect", location.pathname)

      // Fetch Tidal auth status
      setIsLoading(true)
      emitToSocket("GET_USER_SERVICE_AUTHENTICATION_STATUS", {
        userId: currentUser.userId,
        serviceName: "tidal",
      })
    }
  }, [currentUser?.userId, location.pathname])

  // Fallback: set loading to false after timeout if no response
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (isLoading) {
        setIsLoading(false)
      }
    }, 3000)
    return () => clearTimeout(timeout)
  }, [isLoading])

  const handleEnableTidal = () => {
    if (!room) return
    setIsEnabling(true)
    const currentSources = room.metadataSourceIds || ["spotify"]
    const newSources = [...currentSources, "tidal"]
    emitToSocket("SET_ROOM_SETTINGS", { metadataSourceIds: newSources })
  }

  const handleDisconnect = () => {
    setIsDisconnecting(true)
    emitToSocket("LOGOUT_SERVICE", { serviceName: "tidal" })
    // Optimistically update UI - the socket event will confirm
    setTimeout(() => {
      setIsAuthenticated(false)
      setIsDisconnecting(false)
    }, 500)
  }

  return (
    <Box>
      {isLoading && <Spinner size="sm" />}
      {!isLoading && !isAuthenticated && (
        <VStack align="flex-start">
          <Button asChild>
            <Link
              href={`${import.meta.env.VITE_API_URL}/auth/tidal/login?userId=${
                currentUser?.userId
              }&redirect=${encodeURIComponent(location.pathname)}`}
            >
              <Icon as={SiTidal} />
              Link Tidal
            </Link>
          </Button>
          {!hideText && (
            <Text fontSize="sm" mt={2} color="blackAlpha.700">
              Link your Tidal account to pull artwork and release info
            </Text>
          )}
        </VStack>
      )}
      {isAuthenticated && !isTidalEnabled && (
        <VStack align="flex-start" gap={2}>
          <HStack gap={2}>
            <Icon as={LuCheckCircle} color="green.500" />
            <Text fontSize="sm">Tidal account linked</Text>
          </HStack>
          <HStack gap={2}>
            <Button
              size="sm"
              colorPalette="action"
              onClick={handleEnableTidal}
              disabled={isEnabling}
            >
              {isEnabling ? <Spinner size="xs" /> : <Icon as={LuPlus} />}
              Enable Tidal for this room
            </Button>
            <Button
              size="sm"
              variant="ghost"
              colorPalette="red"
              onClick={handleDisconnect}
              disabled={isDisconnecting}
            >
              {isDisconnecting ? <Spinner size="xs" /> : <Icon as={LuUnlink} />}
              Disconnect
            </Button>
          </HStack>
          {!hideText && (
            <Text fontSize="xs" color="gray.500">
              Add Tidal as a metadata source for track info
            </Text>
          )}
        </VStack>
      )}
      {isAuthenticated && isTidalEnabled && (
        <VStack align="flex-start" gap={2}>
          <HStack gap={2}>
            <Icon as={LuCheckCircle} color="primary" _dark={{ color: "secondaryText" }} />
            <Text fontSize="sm">Tidal is linked and enabled for this room</Text>
          </HStack>
          <Button
            size="sm"
            variant="outline"
            colorPalette="red"
            onClick={handleDisconnect}
            disabled={isDisconnecting}
          >
            {isDisconnecting ? <Spinner size="xs" /> : <Icon as={LuUnlink} />}
            Disconnect Tidal
          </Button>
        </VStack>
      )}
    </Box>
  )
}
