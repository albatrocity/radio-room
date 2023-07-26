import React from "react"
import { Router } from "@reach/router"
import { HeadProps } from "gatsby"

import RoomRoute from "../../../components/RoomRoute"
import { useCurrentRoom } from "../../../state/roomStore"
import { useStationMeta } from "../../../state/audioStore"
import { RoomMeta } from "../../../types/Room"

type Props = {}

export default function RoomPage({}: Props) {
  return (
    <Router basepath="/rooms">
      <RoomRoute path="/:roomId" />
    </Router>
  )
}

function buildTitle(meta?: RoomMeta) {
  return meta?.track
    ? `${meta?.track ?? meta?.title}${meta?.artist ? ` | ${meta.artist} ` : ""}`
    : null
}

export function Head({}: HeadProps) {
  const room = useCurrentRoom()
  const meta = useStationMeta()
  const prefix = buildTitle(meta)

  return (
    <>
      <title>
        {!!meta?.bitrate && `${prefix ? `${prefix} | ` : ""}`}
        {room?.title}
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
