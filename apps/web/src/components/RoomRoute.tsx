import React, { useEffect } from "react"
import data from "@emoji-mart/data"
import { init } from "emoji-mart"
import { Flex } from "@chakra-ui/react"
import { usePageVisibility } from "react-page-visibility"
import { useNavigate } from "@tanstack/react-router"

import Room from "./Room"
import AppToasts from "./AppToasts"
import Layout from "./layout"
import { useCurrentRoom } from "../hooks/useActors"
import { initializeRoom, teardownRoom, handleVisibilityChange } from "../actors/roomLifecycle"

init({ data })

const RoomRoute = ({ roomId }: { roomId?: string; path: string }) => {
  const isVisible = usePageVisibility()
  const navigate = useNavigate()
  const room = useCurrentRoom()

  if (!roomId) {
    navigate({ to: "/", replace: true })
  }

  // Initialize room on mount, teardown on unmount
  useEffect(() => {
    if (roomId) {
      initializeRoom(roomId)
    }
    return () => {
      teardownRoom()
    }
  }, [roomId])

  // Handle visibility changes
  useEffect(() => {
    if (room?.id) {
      handleVisibilityChange(isVisible)
    }
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

export default RoomRoute
