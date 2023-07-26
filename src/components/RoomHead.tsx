import { navigate } from "gatsby"
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
    navigate(window.location.pathname, { replace: true })
  }, [title])

  return (
    <>
      <title>{title}</title>
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1, maximum-scale=1"
      />
      <meta name="description" content={room?.extraInfo} />
      <meta name="og:description" content={room?.extraInfo} />
      <meta name="og:title" content={room?.title} />
      <meta name="og:type" content="website" />
    </>
  )
}
