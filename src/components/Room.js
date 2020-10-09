import React, { useContext, useCallback, useEffect } from "react"
import { useMachine } from "@xstate/react"
import Konami from "react-konami-code"
import { Box, Button, Heading } from "grommet"
import { SettingsOption } from "grommet-icons"
import { get, find, uniqBy, reject, sortBy } from "lodash/fp"

import FormAdminMeta from "./FormAdminMeta"
import FormAdminArtwork from "./FormAdminArtwork"
import FormAdminSettings from "./FormAdminSettings"
import Listeners from "./Listeners"
import PlayerUi from "./PlayerUi"
import FormUsername from "./FormUsername"
import Chat from "./Chat"
import UserList from "./UserList"
import Modal from "./Modal"
import AuthContext from "../contexts/AuthContext"
import { roomMachine } from "../machines/roomMachine"
import socket from "../lib/socket"

const Room = () => {
  const { state: authState, send: authSend } = useContext(AuthContext)
  const [roomState, send] = useMachine(roomMachine, {
    actions: {
      disconnectUser: (context, event) => {
        socket.emit("disconnect", authState.context.currentUser.userId)
      },
      setDj: (context, event) => {
        if (event.type === "START_DJ_SESSION") {
          socket.emit("set DJ", authState.context.currentUser.userId)
        } else {
          socket.emit("set DJ", null)
        }
      },
      checkDj: (context, event) => {
        const isDj = get(
          "isDj",
          find(
            { userId: authState.context.currentUser.userId },
            event.data.users
          )
        )
        if (!isDj) {
          send("END_DJ_SESSION")
        }
      },
      kickUser: (context, event) => {
        socket.emit("kick user", { userId: event.userId })
      },
      adminActivated: (context, event) => {
        authSend("ACTIVATE_ADMIN")
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
        const handleTyping = payload => {
          send({ type: "TYPING", data: payload })
        }
        const handleDisconnect = payload => {
          send({ type: "DISCONNECT", data: payload })
        }

        socket.on("init", handleInit)
        socket.on("user joined", handleUserJoin)
        socket.on("user left", handleUserLeave)
        socket.on("typing", handleTyping)
        socket.on("disconnect", () => {
          authSend("USER_DISCONNECTED")
        })

        return () => {
          socket.removeListener("init", handleInit)
          socket.removeListener("user joined", handleUserJoin)
          socket.removeListener("user left", handleUserLeave)
          socket.emit("disconnect")
        }
      },
    },
  })

  useEffect(() => {
    if (authState.context.isNewUser) {
      send("EDIT_USERNAME")
    }
  }, [authState.context.isNewUser])

  const hideListeners = useCallback(() => send("CLOSE_VIEWING"), [send])
  const hideNameForm = useCallback(() => send("CLOSE_EDIT"), [send])

  const listeners = sortBy(
    "connectedAt",
    uniqBy("userId", reject({ isDj: true }, roomState.context.users))
  )
  const dj = find({ isDj: true }, roomState.context.users)

  return (
    <Box flex="grow">
      <Konami action={() => send("ACTIVATE_ADMIN")} />
      {roomState.matches("connected.participating.editing.username") && (
        <Modal
          onClose={() => hideNameForm()}
          heading="Your Name"
          width="medium"
        >
          <FormUsername
            currentUser={authState.context.currentUser}
            isNewUser={authState.context.isNewUser}
            onClose={() => {
              send("CLOSE_EDIT")
            }}
            onSubmit={username => {
              authSend({ type: "UPDATE_USERNAME", data: username })
              hideNameForm()
            }}
          />
        </Modal>
      )}
      {roomState.matches("connected.participating.modalViewing.listeners") && (
        <Modal
          onClose={() => hideListeners()}
          heading={`Listeners (${listeners.length})`}
        >
          <UserList
            listeners={listeners}
            dj={dj}
            typing={roomMachine.context.typing}
            onEditSettings={() => send("ADMIN_EDIT_SETTINGS")}
            onEditUser={() => send("EDIT_USERNAME")}
          />
        </Modal>
      )}

      {roomState.matches("connected.participating.editing.meta") && (
        <Modal onClose={() => send("CLOSE_EDIT")} heading="Set Station Info">
          <FormAdminMeta onSubmit={value => socket.emit("fix meta", value)} />
        </Modal>
      )}

      {roomState.matches("connected.participating.editing.artwork") && (
        <Modal onClose={() => send("CLOSE_EDIT")} heading="Set Cover Artwork">
          <FormAdminArtwork
            onSubmit={value => socket.emit("set cover", value)}
          />
        </Modal>
      )}

      {roomState.matches("connected.participating.editing.settings") && (
        <Modal
          onClose={() => send("CLOSE_EDIT")}
          heading="Settings"
          width="medium"
        >
          <FormAdminSettings
            onSubmit={value => {
              socket.emit("settings", value)
            }}
          />
        </Modal>
      )}

      <PlayerUi />

      <Box direction="row-responsive" flex="grow">
        <Box flex={{ grow: 1, shrink: 1 }} pad="medium">
          <Chat
            users={roomState.context.users}
            modalActive={roomState.matches("connected.participating.editing")}
          />
        </Box>

        {authState.matches("authenticated") && (
          <Box
            style={{ minWidth: "200px", maxWidth: "380px" }}
            flex={{ shrink: 0, grow: 0 }}
            background="light-1"
          >
            <Listeners
              listeners={listeners}
              dj={dj}
              onEditSettings={() => send("ADMIN_EDIT_SETTINGS")}
              onViewListeners={view =>
                view ? send("VIEW_LISTENERS") : send("CLOSE_VIEWING")
              }
              typing={roomState.context.typing}
              onEditUser={() => send("EDIT_USERNAME")}
              onKickUser={userId => send({ type: "KICK_USER", userId })}
            />
            {roomState.matches("admin.isAdmin") && (
              <Box pad="small" flex={{ shrink: 0 }}>
                <Heading level={3} margin={{ bottom: "xsmall" }}>
                  Admin
                </Heading>
                <Box gap="small">
                  {roomState.matches("djaying.notDj") && (
                    <Button
                      label="I am the DJ"
                      onClick={() => send("START_DJ_SESSION")}
                      primary
                    />
                  )}
                  {roomState.matches("djaying.isDj") && (
                    <Button
                      label="End DJ Session"
                      onClick={() => send("END_DJ_SESSION")}
                    />
                  )}
                  <Button
                    label="Change Cover Art"
                    onClick={() => send("ADMIN_EDIT_ARTWORK")}
                  />
                  <Box
                    animation={
                      roomState.matches(
                        "connected.participating.editing.settings"
                      )
                        ? {
                            type: "pulse",
                            delay: 0,
                            duration: 400,
                            size: "medium",
                          }
                        : null
                    }
                  >
                    <Button
                      label="Settings"
                      primary={
                        roomState.matches(
                          "connected.participating.editing.settings"
                        )
                          ? true
                          : false
                      }
                      icon={<SettingsOption />}
                      onClick={() => send("ADMIN_EDIT_SETTINGS")}
                    />
                  </Box>
                </Box>
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Box>
  )
}

export default Room
