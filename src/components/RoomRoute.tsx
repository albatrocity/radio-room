import React, { useEffect } from "react"
import { Helmet } from "react-helmet"
import data from "@emoji-mart/data"
import { init } from "emoji-mart"
import { Flex } from "@chakra-ui/react"
import { usePageVisibility } from "react-page-visibility"

import Room from "./Room"
import AppToasts from "./AppToasts"
import { useAuthStore } from "../state/authStore"
import Layout from "./layout"
import { navigate } from "gatsby"
import { useCurrentRoom, useRoomStore } from "../state/roomStore"
import makeRoomTitle from "../lib/makeToomTitle"
import { useStationMeta } from "../state/audioStore"

init({ data })

const RoomRoute = ({ roomId }: { roomId?: string; path: string }) => {
  const isVisible = usePageVisibility()
  const room = useCurrentRoom()
  const meta = useStationMeta()

  const { send } = useAuthStore()
  const { state: roomState, send: roomSend } = useRoomStore()

  if (!roomId) {
    navigate("/")
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
  }, [])

  useEffect(() => {
    if (isVisible && !!roomState.context.room?.id) {
      roomSend("GET_LATEST_ROOM_DATA")
    }
  }, [isVisible, roomState.context.room])

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
