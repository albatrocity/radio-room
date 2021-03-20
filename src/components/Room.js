import React, { useContext, useCallback, useEffect, useMemo } from "react"
import { useMachine, useService } from "@xstate/react"
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
import FormPassword from "./FormPassword"
import Chat from "./Chat"
import UserList from "./UserList"
import Modal from "./Modal"
import ReactionPicker from "./ReactionPicker"
import { useUsers } from "../contexts/useUsers"
import { useAuth } from "../contexts/useAuth"
import { roomMachine } from "../machines/roomMachine"
import socket from "../lib/socket"

const Room = () => {
  const size = useContext(ResponsiveContext)
  const isMobile = size === "small"
  const [usersState, usersSend] = useUsers()
  const [authState, authSend] = useAuth()

  const {
    context: { listeners, dj },
  } = usersState

  const [roomState, send] = useMachine(roomMachine, {
    actions: {
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
      adminActivated: (context, event) => {
        authSend("ACTIVATE_ADMIN")
      },
      clearPlaylist: (context, event) => {
        socket.emit("clear playlist")
      },
    },
  })

  useEffect(() => {
    if (authState.context.isNewUser) {
      send("EDIT_USERNAME")
    }
  }, [authState.context.isNewUser])

  const hideListeners = useCallback(() => send("CLOSE_VIEWING"), [send])
  const hideEditForm = useCallback(() => send("CLOSE_EDIT"), [send])

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
    <Box className="room" flex={true} height={"100vh"}>
      <Konami action={() => send("ACTIVATE_ADMIN")} />

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
          onClose={() => hideEditForm()}
          heading="Your Name"
          margin="medium"
        >
          <FormUsername
            currentUser={authState.context.currentUser}
            isNewUser={authState.context.isNewUser}
            onClose={hideEditForm}
            onSubmit={username => {
              authSend({ type: "UPDATE_USERNAME", data: username })
              hideEditForm()
            }}
          />
        </Modal>
      )}
      {authState.matches("unauthorized") && (
        <Modal heading="Password" margin="large">
          <FormPassword
            currentUser={authState.context.currentUser}
            error={authState.context.passwordError}
            onSubmit={password => {
              authSend({ type: "SET_PASSWORD", data: password })
            }}
          />
        </Modal>
      )}
      {roomState.matches("connected.participating.modalViewing.listeners") && (
        <Modal
          heading={`Listeners (${listeners.length})`}
          onClose={() => hideListeners()}
          margin="large"
        >
          <Box pad="small" overflow="auto">
            <div>
              <UserList
                showHeading={false}
                onEditSettings={() => send("ADMIN_EDIT_SETTINGS")}
                onEditUser={() => send("EDIT_USERNAME")}
              />
            </div>
          </Box>
        </Modal>
      )}
      {roomState.matches("connected.participating.modalViewing.help") && (
        <Modal
          onClose={() => send("CLOSE_VIEWING")}
          heading="???"
          margin="large"
        >
          <Box pad={{ bottom: "large", horizontal: "medium" }}>
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
        <Modal onClose={hideEditForm} heading="Set Station Info">
          <FormAdminMeta onSubmit={value => socket.emit("fix meta", value)} />
        </Modal>
      )}

      {roomState.matches("connected.participating.editing.artwork") && (
        <Modal onClose={hideEditForm} heading="Set Cover Artwork">
          <FormAdminArtwork
            onSubmit={value => socket.emit("set cover", value)}
          />
        </Modal>
      )}

      {roomState.matches("connected.participating.editing.settings") && (
        <Modal onClose={hideEditForm} heading="Settings" width="medium">
          <FormAdminSettings
            onSubmit={value => {
              socket.emit("settings", value)
            }}
          />
        </Modal>
      )}

      <Box flex={{ shrink: 0, grow: 0 }} basis="auto">
        <PlayerUi
          onShowPlaylist={() => send("TOGGLE_PLAYLIST")}
          hasPlaylist={roomState.context.playlist.length > 0}
          onReactionClick={toggleReaction}
          onOpenReactionPicker={onOpenReactionPicker}
        />
      </Box>

      <Box direction="row-responsive" flex={true} height="100%">
        <Box flex={{ grow: 1, shrink: 1 }} height="100%" pad="medium">
          <Chat
            modalActive={isEditing}
            onOpenReactionPicker={onOpenReactionPicker}
            onReactionClick={toggleReaction}
          />
        </Box>

        <Box
          width={isMobile ? "auto" : "20vw"}
          style={{ minWidth: "250px" }}
          fill={isMobile ? "horizontal" : undefined}
          flex={{ shrink: 0, grow: 0 }}
          background="background-front"
        >
          <Box
            direction={isMobile ? "row" : "column"}
            fill
            align="center"
            style={{
              filter: authState.matches("unauthorized")
                ? "blur(0.5rem)"
                : "none",
            }}
          >
            <Box flex={true} fill>
              <Listeners
                onEditSettings={() => send("ADMIN_EDIT_SETTINGS")}
                onViewListeners={view =>
                  view ? send("VIEW_LISTENERS") : send("CLOSE_VIEWING")
                }
                onEditUser={() => send("EDIT_USERNAME")}
              />
            </Box>
            {!roomState.matches("admin.isAdmin") && (
              <Box pad="small" align="center" flex={{ grow: 0, shrink: 0 }}>
                <Button
                  size="small"
                  secondary
                  hoverIndicator={{ color: "light-3" }}
                  icon={<HelpOption size="medium" color="brand" />}
                  onClick={() => send("VIEW_HELP")}
                />
              </Box>
            )}
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
      </Box>
    </Box>
  )
}

export default Room
