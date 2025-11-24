import React, { useEffect } from "react"
import makeRoomTitle from "../lib/makeRoomTitle"
import { useStationMeta } from "../state/audioStore"
import { useCurrentRoom } from "../state/roomStore"

type Props = {}

export default function RoomHead({}: Props) {
  const room = useCurrentRoom()
  const meta = useStationMeta()
  const title = makeRoomTitle(room, meta)

  useEffect(() => {
    // Update document title
    document.title = title
  }, [title])

  return null // TanStack Router handles head management differently
}
