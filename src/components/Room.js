import React, { useEffect, useContext, useCallback } from "react"
import { SESSION_ID, SESSION_USERNAME } from "../constants"
import {
  Box,
  Header,
  Main,
  Button,
  Layer,
  Heading,
  Paragraph,
  Menu,
  Sidebar,
  Nav,
  Avatar,
} from "grommet"
import { Close } from "grommet-icons"
import { get } from "lodash/fp"

import RadioPlayer from "./RadioPlayer"
import Listeners from "./Listeners"
import UserList from "./UserList"
import NowPlaying from "./NowPlaying"
import FormUsername from "./FormUsername"
import Chat from "./Chat"
import RoomContext from "../contexts/RoomContext"
import SocketContext from "../contexts/SocketContext"
import PlayerContext from "../contexts/PlayerContext"

const Room = () => {
  const { state, dispatch } = useContext(RoomContext)
  const playerCtx = useContext(PlayerContext)
  const { socket } = useContext(SocketContext)

  const hideListeners = useCallback(
    () => dispatch({ type: "VIEW_LISTENERS", payload: false }),
    [dispatch]
  )
  const hideNameForm = useCallback(
    () => dispatch({ type: "CLOSE_USERNAME_FORM" }),
    [dispatch]
  )

  useEffect(() => {
    socket.on("meta", payload => {
      playerCtx.dispatch({ type: "SET_META", payload })
    })
    socket.on("user joined", payload => {
      dispatch({ type: "USER_ADDED", payload })
    })
    socket.on("user left", payload => {
      dispatch({ type: "REMOVE_USER", payload })
    })
    socket.on("login", payload => {
      dispatch({ type: "LOGIN", payload })
      playerCtx.dispatch({ type: "LOGIN", payload })
    })
    socket.on("init", payload => {
      dispatch({ type: "INIT", payload })
      playerCtx.dispatch({ type: "SET_META", payload: get("meta", payload) })
    })
    socket.on("new message", payload => {
      dispatch({ type: "NEW_MESSAGE", payload })
    })
    socket.on("typing", payload => {
      dispatch({ type: "TYPING", payload })
    })
  }, [])

  useEffect(() => {
    dispatch({
      type: "LOGIN",
      payload: null,
    })

    return () => {
      dispatch({
        type: "USER_DISCONNECTED",
        payload: null,
      })
    }
  }, [])

  return (
    <Box flex="grow">
      {(state.isNewUser || state.editingUser) && (
        <Layer responsive={false}>
          <Box
            fill="horizontal"
            direction="row"
            justify="between"
            align="center"
            pad="medium"
            flex={{ shrink: 0 }}
          >
            <Heading margin="none" level={2}>
              Name
            </Heading>
            <Button onClick={hideNameForm} plain icon={<Close />} />
          </Box>
          <FormUsername />
        </Layer>
      )}
      {state.viewingListeners && (
        <Layer responsive={false} onClickOutside={hideListeners}>
          <Box
            fill="horizontal"
            direction="row"
            justify="between"
            align="center"
            pad="medium"
            flex={{ shrink: 0 }}
          >
            <Heading margin="none" level={2}>
              Listeners ({state.users.length})
            </Heading>
            <Button onClick={hideListeners} plain icon={<Close />} />
          </Box>
          <Box width="300px" pad="medium" overflow="auto">
            <UserList />
          </Box>
        </Layer>
      )}
      <Box>
        <NowPlaying />
        <RadioPlayer />
      </Box>
      <Box direction="row-responsive" flex="grow">
        <Box flex={{ grow: 1, shrink: 1 }} pad="medium">
          <Chat />
        </Box>
        <Box
          style={{ minWidth: "200px" }}
          flex={{ shrink: 0 }}
          background="light-2"
          elevation="small"
        >
          <Listeners />
        </Box>
      </Box>
    </Box>
  )
}

export default Room
