import React, { useContext, useCallback, useEffect } from "react"
import { useMachine } from "@xstate/react"
import Konami from "react-konami-code"
import { Box, Button, Heading, Layer, Drop } from "grommet"
import { SettingsOption, List } from "grommet-icons"
import { get, find, uniqBy, reject, sortBy } from "lodash/fp"

import FormAdminMeta from "./FormAdminMeta"
import FormAdminArtwork from "./FormAdminArtwork"
import FormAdminSettings from "./FormAdminSettings"
import Listeners from "./Listeners"
import PlayerUi from "./PlayerUi"
import Playlist from "./Playlist"
import FormUsername from "./FormUsername"
import Chat from "./Chat"
import UserList from "./UserList"
import Modal from "./Modal"
import ReactionPicker from "./ReactionPicker"
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
      clearPlaylist: (context, event) => {
        socket.emit("clear playlist")
      },
      submitReaction: (context, event) => {
        const { emoji, reactTo } = event
        socket.emit("add reaction", { emoji, reactTo })
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
        const handlePlaylist = payload => {
          send({ type: "PLAYLIST_DATA", data: payload })
        }
        const handleDisconnect = payload => {
          send({ type: "DISCONNECT", data: payload })
        }

        socket.on("init", handleInit)
        socket.on("user joined", handleUserJoin)
        socket.on("user left", handleUserLeave)
        socket.on("typing", handleTyping)
        socket.on("playlist", handlePlaylist)
        socket.on("disconnect", () => {
          authSend("USER_DISCONNECTED")
        })

        return () => {
          socket.removeListener("init", handleInit)
          socket.removeListener("user joined", handleUserJoin)
          socket.removeListener("user left", handleUserLeave)
          socket.removeListener("playlist", handlePlaylist)
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

  const onOpenReactionPicker = useCallback((dropRef, reactTo) => {
    send("TOGGLE_REACTION_PICKER", { dropRef, reactTo })
  })

  return (
    <Box flex="grow">
      <Konami action={() => send("ACTIVATE_ADMIN")} />
      {roomState.matches("reactionPicker.active") &&
        roomState.context.reactionPickerRef && (
          <Drop
            onClickOutside={() => send("TOGGLE_REACTION_PICKER")}
            onEsc={() => send("TOGGLE_REACTION_PICKER")}
            target={roomState.context.reactionPickerRef.current}
          >
            <ReactionPicker
              onSelect={emoji => {
                send("SELECT_REACTION", {
                  emoji,
                  reactTo: roomState.context.reactTo,
                })
              }}
            />
          </Drop>
        )}
      {roomState.matches("playlist.active") && (
        <Modal
          position="left"
          full="vertical"
          responsive={false}
          heading="Playlist"
          contentPad="none"
          onClose={() => send("TOGGLE_PLAYLIST")}
          width={{ min: "100%", max: "90vw" }}
        >
          <Box>
            <Playlist data={roomState.context.playlist} />
          </Box>
        </Modal>
      )}
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

      <PlayerUi
        onShowPlaylist={() => send("TOGGLE_PLAYLIST")}
        hasPlaylist={roomState.context.playlist.length > 0}
      />

      <Box direction="row-responsive" flex="grow">
        <Box flex={{ grow: 1, shrink: 1 }} pad="medium">
          <Chat
            users={roomState.context.users}
            modalActive={roomState.matches("connected.participating.editing")}
            onOpenReactionPicker={onOpenReactionPicker}
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
                  {roomState.matches("djaying.isDj") && (
                    <Button
                      label="Clear Playlist"
                      primary
                      icon={<List />}
                      onClick={() => send("ADMIN_CLEAR_PLAYLIST")}
                    />
                  )}
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
