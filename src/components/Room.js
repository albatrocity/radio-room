import React, { useContext, useCallback, useEffect, useMemo } from "react"
import { useMachine } from "@xstate/react"
import Konami from "react-konami-code"
import {
  Box,
  Text,
  Button,
  Heading,
  Layer,
  Drop,
  Paragraph,
  Anchor,
  ResponsiveContext,
} from "grommet"
import { SettingsOption, List, HelpOption } from "grommet-icons"
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
import { useChatReactions } from "../contexts/useChatReactions"
import { useTrackReactions } from "../contexts/useTrackReactions"
import { useUsers } from "../contexts/useUsers"
import { roomMachine } from "../machines/roomMachine"
import socket from "../lib/socket"

const Room = () => {
  const { state: authState, send: authSend } = useContext(AuthContext)
  const size = useContext(ResponsiveContext)
  const isMobile = size === "small"
  const { dispatch: chatDispatch } = useChatReactions()
  const { dispatch: trackDispatch } = useTrackReactions()
  const { dispatch: usersDispatch } = useUsers()
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
      dispatchReactions: (context, event) => {
        chatDispatch({ type: "SET", payload: event.data.reactions })
        trackDispatch({ type: "SET", payload: event.data.reactions })
      },
      dispatchUsers: (context, event) => {
        usersDispatch({ type: "SET", payload: event.data.users })
      },
      toggleReaction: (context, event) => {
        const { reactTo, emoji } = event
        const subjectReactions = context.reactions[reactTo.type][reactTo.id]
        const existing = find(
          { user: authState.context.currentUser.userId, emoji: emoji.colons },
          subjectReactions
        )
        if (existing) {
          socket.emit("remove reaction", {
            emoji,
            reactTo,
            user: authState.context.currentUser,
          })
        } else {
          socket.emit("add reaction", {
            emoji,
            reactTo,
            user: authState.context.currentUser,
          })
        }
      },
      removeReaction: (context, event) => {
        const { emoji, reactTo } = event
        socket.emit("remove reaction", {
          emoji,
          reactTo,
          user: authState.context.currentUser,
        })
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
          usersDispatch({ type: "SET_TYPING", payload })
        }
        const handlePlaylist = payload => {
          send({ type: "PLAYLIST_DATA", data: payload })
        }
        const handleDisconnect = payload => {
          send({ type: "DISCONNECT", data: payload })
        }
        const handleReactions = payload => {
          send({ type: "REACTIONS_DATA", data: payload })
        }

        socket.on("init", handleInit)
        socket.on("user joined", handleUserJoin)
        socket.on("user left", handleUserLeave)
        socket.on("typing", handleTyping)
        socket.on("playlist", handlePlaylist)
        socket.on("reactions", handleReactions)
        socket.on("disconnect", () => {
          authSend("USER_DISCONNECTED")
        })

        return () => {
          socket.removeListener("init", handleInit)
          socket.removeListener("user joined", handleUserJoin)
          socket.removeListener("user left", handleUserLeave)
          socket.removeListener("playlist", handlePlaylist)
          socket.removeListener("reactions", handleReactions)
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

  const onOpenReactionPicker = useCallback((dropRef, reactTo) => {
    send("TOGGLE_REACTION_PICKER", { dropRef, reactTo })
  })

  const toggleReaction = useCallback(({ reactTo, emoji }) => {
    send("SELECT_REACTION", { reactTo, emoji })
  })

  const isEditing = useMemo(
    () => roomState.matches("connected.participating.editing"),
    [roomState]
  )

  return (
    <Box flex="grow">
      <Konami action={() => send("ACTIVATE_ADMIN")} />
      {roomState.matches("reactionPicker.active") &&
        roomState.context.reactionPickerRef && (
          <Drop
            plain
            overflow="visible"
            onClickOutside={() => send("TOGGLE_REACTION_PICKER")}
            onEsc={() => send("TOGGLE_REACTION_PICKER")}
            target={roomState.context.reactionPickerRef.current}
            align={{ top: "top", right: "right" }}
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
        <Modal onClose={() => hideNameForm()} heading="Your Name">
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
          heading={`Listeners (${
            reject({ isDj: true }, roomState.context.users).length
          })`}
        >
          <Box pad="small">
            <UserList
              onEditSettings={() => send("ADMIN_EDIT_SETTINGS")}
              onEditUser={() => send("EDIT_USERNAME")}
            />
          </Box>
        </Modal>
      )}
      {roomState.matches("connected.participating.modalViewing.help") && (
        <Modal
          onClose={() => send("CLOSE_VIEWING")}
          heading="???"
          margin="large"
        >
          <Box pad={{ top: 0, bottom: "large", horizontal: "medium" }}>
            <div>
              <Heading level={3}>Cordial</Heading>
              <Paragraph>
                Thanks for being here! You are participating in a somewhat
                communal listening of an internet radio broadcast. Please note
                that there's a 10-15 second broadcast delay. This is made for
                fun only.
              </Paragraph>
              <Heading level={3}>Psuedo-legal</Heading>
              <Paragraph>
                No personally identifiably information (other than the name you
                submit) is collected by this service. All chat, playlist, and
                username data is stored in server memory and will be obliterated
                when the server restarts or crashes. Take solace in this
                sandcastle by the waves.
              </Paragraph>
              <Heading level={3}>Help</Heading>
              <Paragraph>
                If you're experiencing issues, try refreshing the page. If all
                hope is lost, contact <Text weight={700}>@Ross</Text> in the
                chat or send him{" "}
                <Anchor href="mailto:albatrocity@gmail.com">
                  a nice email
                </Anchor>
                .
              </Paragraph>
              <Heading level={3}>Technical</Heading>
              <Paragraph margin={{ bottom: "large" }}>
                This is a{" "}
                <Anchor target="_blank" href="http://reactjs.org">
                  React
                </Anchor>
                /
                <Anchor target="_blank" href="http://gatsbyjs.com">
                  Gatsby
                </Anchor>{" "}
                web application (using the{" "}
                <Anchor target="_blank" href="http://v2.grommet.io">
                  Grommet
                </Anchor>{" "}
                component library) that communicates to a NodeJS web process to
                facilitate{" "}
                <Anchor target="_blank" href="http://socket.io">
                  Socket.io
                </Anchor>{" "}
                connections and poll a Shoutcast server that's actually
                streaming the audio. Cover art and release information is
                fetched from the{" "}
                <Anchor target="_blank" href="https://musicbrainz.org">
                  MusicBrainz
                </Anchor>{" "}
                API. Typically, broadcasting is done using some excellent
                software from{" "}
                <Anchor target="_blank" href="http://rogueamoeba.com">
                  Rogue Amoeba
                </Anchor>
                .
              </Paragraph>
            </div>
          </Box>
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
        onReactionClick={toggleReaction}
        onOpenReactionPicker={onOpenReactionPicker}
      />

      <Box direction="row-responsive" flex="grow">
        <Box flex={{ grow: 1, shrink: 1 }} pad="medium">
          <Chat
            modalActive={isEditing}
            onOpenReactionPicker={onOpenReactionPicker}
            onReactionClick={toggleReaction}
          />
        </Box>

        {authState.matches("authenticated") && (
          <Box
            style={{ minWidth: "200px", maxWidth: "380px" }}
            flex={{ shrink: 0, grow: 0 }}
            background="light-1"
          >
            <Box direction={isMobile ? "row" : "column"} fill align="center">
              <Box flex={true} fill>
                <Listeners
                  onEditSettings={() => send("ADMIN_EDIT_SETTINGS")}
                  onViewListeners={view =>
                    view ? send("VIEW_LISTENERS") : send("CLOSE_VIEWING")
                  }
                  onEditUser={() => send("EDIT_USERNAME")}
                  onKickUser={userId => send({ type: "KICK_USER", userId })}
                />
              </Box>
              <Box pad="medium" align="center" flex={{ grow: 0, shrink: 0 }}>
                <Button
                  size="small"
                  secondary
                  hoverIndicator={{ color: "light-3" }}
                  icon={<HelpOption size="medium" color="brand" />}
                  onClick={() => send("VIEW_HELP")}
                />
              </Box>
            </Box>
            {roomState.matches("admin.isAdmin") && (
              <Box pad="medium" flex={{ shrink: 0 }}>
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
                      icon={<SettingsOption size="small" />}
                      onClick={() => send("ADMIN_EDIT_SETTINGS")}
                    />
                  </Box>
                  {roomState.matches("djaying.isDj") && (
                    <Button
                      label="Clear Playlist"
                      primary
                      icon={<List size="small" />}
                      onClick={() => {
                        const confirmation = window.confirm(
                          "Are you sure you want to clear the playlist? This cannot be undone."
                        )
                        if (confirmation) {
                          send("ADMIN_CLEAR_PLAYLIST")
                        }
                      }}
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
