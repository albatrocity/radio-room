import React, { useEffect } from "react"
import data from "@emoji-mart/data"
import { init } from "emoji-mart"
import { Flex } from "@chakra-ui/react"
import { usePageVisibility } from "react-page-visibility"

import Room from "./Room"
import AppToasts from "./AppToasts"
import { useAuthStore } from "../state/authStore"
import Layout from "./layout"
import { navigate } from "gatsby"
import { useRoomStore } from "../state/roomStore"

init({ data })

const RoomRoute = ({ roomId }: { roomId?: string; path: string }) => {
  const { send } = useAuthStore()
  const { state: roomState, send: roomSend } = useRoomStore()

  if (!roomId) {
    navigate("/")
  }

  const isVisible = usePageVisibility()

  useEffect(() => {
    roomSend("FETCH", { data: { id: roomId } })
  }, [send, roomSend, roomId])

  useEffect(() => {
    return () => {
      send("USER_DISCONNECTED")
    }
  })

  useEffect(() => {
    if (isVisible && !!roomState.context.room?.id) {
      send("SETUP", { data: { roomId } })
    }
  }, [isVisible, roomState.context.room])

  return roomId ? (
    <Layout>
      <Flex grow={1} shrink={1} w="100%" h="100%">
        <AppToasts />
        <Room id={roomId} />
      </Flex>
    </Layout>
  ) : null
}

export default RoomRoute
