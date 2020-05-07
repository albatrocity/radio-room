import React, { useEffect, useContext, useCallback } from "react"
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

const Room = () => {
  const { state, send } = useContext(RoomContext)

  const hideListeners = useCallback(
    () => send({ type: "VIEW_LISTENERS", payload: false }),
    [send]
  )
  const hideNameForm = useCallback(
    () => send({ type: "CLOSE_USERNAME_FORM" }),
    [send]
  )

  useEffect(() => {
    send("SETUP")
    return () => {
      send("USER_DISCONNECTED")
    }
  }, [])

  return (
    <Box flex="grow">
      <Konami action={() => send({ type: "ADMIN_PANEL", payload: true })} />
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
          onClickOutside={() => send({ type: "ADMIN_PANEL", payload: false })}
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
              onClick={() => send({ type: "ADMIN_PANEL", payload: false })}
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
