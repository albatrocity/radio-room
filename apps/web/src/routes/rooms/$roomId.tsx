import React, { useEffect, useRef } from "react"
import data from "@emoji-mart/data"
import { init } from "emoji-mart"
import { Flex } from "@chakra-ui/react"
import { usePageVisibility } from "react-page-visibility"
import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router"

import Room from "../../components/Room"
import AppToasts from "../../components/AppToasts"
import Layout from "../../components/layout"
import { useCurrentRoom } from "../../hooks/useActors"
import { initializeRoom, teardownRoom, handleVisibilityChange } from "../../actors/roomLifecycle"

init({ data })

export const Route = createFileRoute("/rooms/$roomId")({
  component: RoomRoute,
})

function RoomRoute() {
  const { roomId } = useParams({ from: "/rooms/$roomId" })
  const navigate = useNavigate()
  const isVisible = usePageVisibility()

  const room = useCurrentRoom()

  if (!roomId) {
    navigate({ to: "/" })
  }

  // Initialize room lifecycle
  useEffect(() => {
    if (roomId) {
      initializeRoom(roomId)
    }
    return () => {
      teardownRoom()
    }
  }, [roomId])

  // Handle visibility changes - only when tab becomes visible again
  const wasVisible = useRef(true)
  useEffect(() => {
    // Only fetch when transitioning from hidden to visible
    if (isVisible && !wasVisible.current && room?.id) {
      handleVisibilityChange(true)
    }
    wasVisible.current = isVisible
  }, [isVisible, room?.id])

  return roomId ? (
    <Layout fill>
      <Flex grow={1} shrink={1} w="100%" h="100%">
        <AppToasts />
        <Room id={roomId} />
      </Flex>
    </Layout>
  ) : null
}
