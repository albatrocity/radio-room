import React, { useContext, useCallback } from "react"
import { useMachine } from "@xstate/react"
import Konami from "react-konami-code"
import { Box, Button, Layer, Heading } from "grommet"
import { Close } from "grommet-icons"
import { get, find } from "lodash/fp"

import AdminPanel from "./AdminPanel"
import RadioPlayer from "./RadioPlayer"
import Listeners from "./Listeners"
import NowPlaying from "./NowPlaying"
import FormUsername from "./FormUsername"
import Chat from "./Chat"
import UserList from "./UserList"
import AuthContext from "../contexts/AuthContext"
import { roomMachine } from "../machines/roomMachine"
import socket from "../lib/socket"

const Room = () => {
  const { state: authState, send: authSend } = useContext(AuthContext)
  const [roomState, send] = useMachine(roomMachine, {
    actions: {
      disconnectUser: (context, event) => {
        socket.emit("disconnect", authState.currentUser.userId)
      },
      setDj: (context, event) => {
        socket.emit("set DJ", authState.currentUser.userId)
      },
      checkDj: (context, event) => {
        const isDj = get(
          "isDj",
          find({ userId: authState.currentUser.userId }, event.data.users)
        )
        if (!isDj) {
          send("END_DJ_SESSION")
        }
      },
    },
    activities: {
      setupListeners: ctx => {
        const handleUserJoin = payload => {
          send({ type: "USER_ADDED", data: payload })
        }
        const handleUserLeave = payload => {
          send({ type: "REMOVE_USER", data: payload })
        }
        const handleInit = payload => {
          send({ type: "LOGIN", data: payload })
        }

        socket.on("init", handleInit)
        socket.on("user joined", handleUserJoin)
        socket.on("user left", handleUserLeave)

        return () => {
          socket.removeListener("init", handleInit)
          socket.removeListener("user joined", handleUserJoin)
          socket.removeListener("user left", handleUserLeave)
          socket.emit("disconnect")
        }
      },
    },
  })

  const hideListeners = useCallback(() => send("CLOSE_VIEWING"), [send])
  const hideNameForm = useCallback(() => send("CLOSE_EDIT"), [send])

  return (
    <Box flex="grow">
      <Konami action={() => send("ACTIVATE_ADMIN")} />
      {roomState.matches("connected.editing.username") && (
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
          <FormUsername
            currentUser={authState.currentUser}
            onClose={() => send("CLOSE_EDIT")}
            onSubmit={username => {
              authSend({ type: "UPDATE_USERNAME", data: username })
              hideNameForm()
            }}
          />
        </Layer>
      )}
      {roomState.matches("connected.modalViewing.listeners") && (
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
              Listeners ({roomState.context.users.length})
            </Heading>
            <Button onClick={hideListeners} plain icon={<Close />} />
          </Box>
          <Box width="300px" pad="medium" overflow="auto">
            <UserList
              users={roomState.context.users}
              onEditUser={() => send("EDIT_USERNAME")}
            />
          </Box>
        </Layer>
      )}
      {/*
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
      */}
      <Box>
        <NowPlaying />
        <RadioPlayer />
      </Box>
      <Box direction="row-responsive" flex="grow">
        <Box flex={{ grow: 1, shrink: 1 }} pad="medium">
          <Chat users={roomState.context.users} />
        </Box>
        <Box
          style={{ minWidth: "200px" }}
          flex={{ shrink: 0 }}
          background="light-2"
          elevation="small"
        >
          <Listeners
            users={roomState.context.users}
            onViewListeners={view =>
              view ? send("VIEW_LISTENERS") : send("CLOSE_VIEWING")
            }
            onEditUser={() => send("EDIT_USERNAME")}
          />
          {roomState.matches("admin.isAdmin") && (
            <Box pad="small" flex={{ shrink: 0 }}>
              <Heading level={3}>Admin</Heading>
              {roomState.matches("djaying.notDj") && (
                <Button
                  label="I am the DJ"
                  onClick={() => send("START_DJ_SESSION")}
                />
              )}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  )
}

export default Room
