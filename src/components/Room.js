import React, { useEffect, useContext } from "react"
import { v4 as uuidv4 } from "uuid"
import session from "sessionstorage"
import { SESSION_ID, SESSION_USERNAME } from "../constants"
import {
  Box,
  Header,
  Main,
  Button,
  Icons,
  Heading,
  Paragraph,
  Menu,
  Sidebar,
  Nav,
  Avatar,
} from "grommet"

import RadioPlayer from "./RadioPlayer"
import UserList from "./UserList"
import NowPlaying from "./NowPlaying"
import Chat from "./Chat"
import RoomContext from "../contexts/RoomContext"
import SocketContext from "../contexts/SocketContext"

const Room = () => {
  const { state, dispatch } = useContext(RoomContext)
  const { socket } = useContext(SocketContext)

  useEffect(() => {
    socket.on("meta", payload => {
      dispatch({ type: "SET_META", payload })
    })
    socket.on("user joined", payload => {
      console.log("USER JOINED")
      console.log("payload")
      dispatch({ type: "ADD_USER", payload })
    })
    socket.on("user left", payload => {
      dispatch({ type: "REMOVE_USER", payload })
    })
  }, []) //only re-run the effect if new message comes in

  useEffect(() => {
    const username = "ROSS"
    const userId = session.getItem("radio-session-id") || uuidv4()
    session.setItem(SESSION_ID, userId)
    session.setItem(SESSION_USERNAME, username)

    socket.emit("add user", { username, userId })

    return () => {
      socket.emit("disconnect", userId)
    }
  })

  return (
    <Box>
      <RadioPlayer />
      <UserList />
      <NowPlaying />
      <Chat />
    </Box>
  )
}

export default Room
