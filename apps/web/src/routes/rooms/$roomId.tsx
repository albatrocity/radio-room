import React, { useEffect } from "react"
import data from "@emoji-mart/data"
import { init } from "emoji-mart"
import { Flex } from "@chakra-ui/react"
import { usePageVisibility } from "react-page-visibility"
import { createFileRoute, useParams, useNavigate } from '@tanstack/react-router'

import Room from "../../components/Room"
import AppToasts from "../../components/AppToasts"
import { useAuthStore } from "../../state/authStore"
import Layout from "../../components/layout"
import { useRoomStore } from "../../state/roomStore"

init({ data })

export const Route = createFileRoute('/rooms/$roomId')({
  component: RoomRoute,
})

function RoomRoute() {
  const { roomId } = useParams({ from: '/rooms/$roomId' })
  const navigate = useNavigate()
  const isVisible = usePageVisibility()

  const { send } = useAuthStore()
  const { state: roomState, send: roomSend } = useRoomStore()

  if (!roomId) {
    navigate({ to: "/" })
  }

  useEffect(() => {
    roomSend("FETCH", { data: { id: roomId } })
    return () => {
      roomSend("RESET")
    }
  }, [send, roomSend, roomId])

  useEffect(() => {
    send("SETUP", { data: { roomId } })
    return () => {
      send("USER_DISCONNECTED")
    }
  }, [send, roomId])

  useEffect(() => {
    if (isVisible && !!roomState.context.room?.id) {
      roomSend("GET_LATEST_ROOM_DATA")
    }
  }, [isVisible, roomState.context.room, roomSend])

  return roomId ? (
    <Layout fill>
      <Flex grow={1} shrink={1} w="100%" h="100%">
        <AppToasts />
        <Room id={roomId} />
      </Flex>
    </Layout>
  ) : null
}

