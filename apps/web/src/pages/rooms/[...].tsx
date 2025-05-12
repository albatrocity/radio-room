import React from "react"
import { Router } from "@reach/router"
import { HeadProps } from "gatsby"

import RoomRoute from "../../components/RoomRoute"
import RoomHead from "../../components/RoomHead"

type Props = {}

export default function RoomPage({}: Props) {
  return (
    <Router basepath="/rooms">
      <RoomRoute path="/:roomId" />
    </Router>
  )
}

export function Head({}: HeadProps) {
  return <RoomHead />
}
