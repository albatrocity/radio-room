import React from "react"
import { Router } from "@reach/router"
import RoomRoute from "../../components/RoomRoute"

type Props = {}

export default function RoomPage({}: Props) {
  return (
    <Router basepath="/rooms">
      <RoomRoute path="/:roomId" />
    </Router>
  )
}
