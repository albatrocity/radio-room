import React from "react"
import { useStationMeta } from "../state/audioStore"
import { useCurrentRoom } from "../state/roomStore"
import { RoomMeta } from "../types/Room"

type Props = {}

function buildTitle(meta?: RoomMeta) {
  return meta?.track
    ? `${meta?.track ?? meta?.title}${meta?.artist ? ` | ${meta.artist} ` : ""}`
    : null
}

export default function RoomHead({}: Props) {
  const room = useCurrentRoom()
  const meta = useStationMeta()
  const prefix = buildTitle(meta)

  return (
    <>
      <title>
        {`${prefix ? `${prefix} | ` : ""}`}
        {room?.title ? room.title : "Listening Room"}
      </title>
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
