import React, { useEffect, useContext, useCallback } from "react"
import { useMachine } from "@xstate/react"
import Konami from "react-konami-code"
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

import { SESSION_ID, SESSION_USERNAME } from "../constants"
import AdminPanel from "./AdminPanel"
import RadioPlayer from "./RadioPlayer"
import Listeners from "./Listeners"
import UserList from "./UserList"
import NowPlaying from "./NowPlaying"
import FormUsername from "./FormUsername"
import Chat from "./Chat"
import RoomContext from "../contexts/RoomContext"
import SocketContext from "../contexts/SocketContext"
import { audioMachine } from "../machines/audioMachine"

const Room = () => {
  const { state, dispatch } = useContext(RoomContext)
  const [playerState, playerSend] = useMachine(audioMachine)
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
      playerSend("SET_META", { meta: get("meta", payload) })
    })
    socket.on("user joined", payload => {
      dispatch({ type: "USER_ADDED", payload })
    })
    socket.on("user left", payload => {
      dispatch({ type: "REMOVE_USER", payload })
    })
    socket.on("login", payload => {
      dispatch({ type: "LOGIN", payload })
    })
    socket.on("init", payload => {
      dispatch({ type: "INIT", payload })
      console.log("INIT GET META", get("meta", payload))
      playerSend("SET_META", { meta: get("meta", payload) })
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
      <Konami action={() => dispatch({ type: "ADMIN_PANEL", payload: true })} />
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
      {state.adminPanel && (
        <Layer
          responsive={false}
          onClickOutside={() =>
            dispatch({ type: "ADMIN_PANEL", payload: false })
          }
        >
          <Box
            fill="horizontal"
            direction="row"
            justify="between"
            align="center"
            pad="medium"
            flex={{ shrink: 0 }}
          >
            <Heading margin="none" level={2}>
              Admin
            </Heading>
            <Button
              onClick={() => dispatch({ type: "ADMIN_PANEL", payload: false })}
              plain
              icon={<Close />}
            />
          </Box>
          <Box width="300px" pad="medium" overflow="auto">
            <AdminPanel />
          </Box>
        </Layer>
      )}
      <Box>
        <NowPlaying />
        <RadioPlayer />
      </Box>
      <Box direction="row-responsive" flex="grow">
        <Box flex={{ grow: 1, shrink: 1 }} pad="medium">
          <Chat users={state.users} />
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
