import React, { useContext, useCallback, useEffect, useMemo } from "react"
import { useSelector } from "@xstate/react"
import Konami from "react-konami-code"

import {
  Box,
  Text,
  Button,
  Heading,
  Paragraph,
  Anchor,
  ResponsiveContext,
} from "grommet"
import { SettingsOption, List, HelpOption } from "grommet-icons"

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
import { GlobalStateContext } from "../contexts/global"
import socket from "../lib/socket"

const isEditingSelector = (state) =>
  state.matches("connected.participating.editing")
const playlistActiveSelector = (state) => state.matches("playlist.active")
const isEditingUsernameSelector = (state) =>
  state.matches("connected.participating.editing.username")
const isModalViewingListenersSelector = (state) =>
  state.matches("connected.participating.modalViewing.listeners")
const isModalViewingHelpSelector = (state) =>
  state.matches("connected.participating.modalViewing.help")
const isEditingMetaSelector = (state) =>
  state.matches("connected.participating.editing.meta")
const isEditingArtworkSelector = (state) =>
  state.matches("connected.participating.editing.artwork")
const isEditingSettingsSelector = (state) =>
  state.matches("connected.participating.editing.settings")
const isDjSelector = (state) => state.matches("djaying.isDj")
const isNotDjSelector = (state) => state.matches("djaying.notDj")
const playlistSelector = (state) => state.context.playlist
const isAdminSelector = (state) => state.context.isAdmin
const isNewUserSelector = (state) => state.context.isNewUser
const isUnauthorizedSelector = (state) => state.matches("unauthorized")
const currentUserSelector = (state) => state.context.currentUser
const passwordErrorSelector = (state) => state.context.passwordError
const listenersSelector = (state) => state.context.listeners
const djSelector = (state) => state.context.dj

const Room = () => {
  const size = useContext(ResponsiveContext)
  const globalServices = useContext(GlobalStateContext)
  const isEditing = useSelector(globalServices.roomService, isEditingSelector)
  const playlistActive = useSelector(
    globalServices.roomService,
    playlistActiveSelector,
  )
  const isEditingUsername = useSelector(
    globalServices.roomService,
    isEditingUsernameSelector,
  )
  const isModalViewingListeners = useSelector(
    globalServices.roomService,
    isModalViewingListenersSelector,
  )
  const isModalViewingHelp = useSelector(
    globalServices.roomService,
    isModalViewingHelpSelector,
  )
  const isEditingMeta = useSelector(
    globalServices.roomService,
    isEditingMetaSelector,
  )
  const isEditingArtwork = useSelector(
    globalServices.roomService,
    isEditingArtworkSelector,
  )
  const isEditingSettings = useSelector(
    globalServices.roomService,
    isEditingSettingsSelector,
  )
  const isNewUser = useSelector(globalServices.authService, isNewUserSelector)
  const isAdmin = useSelector(globalServices.authService, isAdminSelector)
  const isUnauthorized = useSelector(
    globalServices.authService,
    isUnauthorizedSelector,
  )
  const currentUser = useSelector(
    globalServices.authService,
    currentUserSelector,
  )
  const passwordError = useSelector(
    globalServices.authService,
    passwordErrorSelector,
  )
  const isDj = useSelector(globalServices.roomService, isDjSelector)
  const isNotDj = useSelector(globalServices.roomService, isNotDjSelector)
  const playlist = useSelector(globalServices.roomService, playlistSelector)

  const isMobile = size === "small"

  const listeners = useSelector(globalServices.usersService, listenersSelector)

  useEffect(() => {
    if (isNewUser) {
      globalServices.roomService.send("EDIT_USERNAME")
    }
  }, [isNewUser])

  useEffect(() => {
    if (isAdmin) {
      globalServices.roomService.send("ACTIVATE_ADMIN")
    }
  }, [isAdmin])

  const hideListeners = useCallback(
    () => globalServices.roomService.send("CLOSE_VIEWING"),
    [globalServices],
  )
  const hideEditForm = useCallback(
    () => globalServices.roomService.send("CLOSE_EDIT"),
    [globalServices],
  )

  const onOpenReactionPicker = useCallback(
    (dropRef, reactTo) => {
      globalServices.roomService.send("TOGGLE_REACTION_PICKER", {
        dropRef,
        reactTo,
      })
    },
    [globalServices],
  )

  const toggleReaction = useCallback(
    ({ reactTo, emoji }) => {
      globalServices.roomService.send("SELECT_REACTION", { reactTo, emoji })
    },
    [globalServices],
  )

  return (
    <Box className="room" flex={true} height={"100vh"}>
      <Konami
        action={() => globalServices.roomService.send("ACTIVATE_ADMIN")}
      />

      {playlistActive && (
        <Modal
          position="left"
          full="vertical"
          responsive={false}
          heading="Playlist"
          contentPad="none"
          onClose={() => globalServices.roomService.send("TOGGLE_PLAYLIST")}
          width={{ min: "100%", max: "90vw" }}
        >
          <Box>
            <Playlist data={playlist} />
          </Box>
        </Modal>
      )}
      {isEditingUsername && (
        <Modal
          onClose={() => hideEditForm()}
          heading="Your Name"
          margin="medium"
        >
          <FormUsername
            currentUser={currentUser}
            isNewUser={isNewUser}
            onClose={hideEditForm}
            onSubmit={(username) => {
              globalServices.authService.send({
                type: "UPDATE_USERNAME",
                data: username,
              })
              hideEditForm()
            }}
          />
        </Modal>
      )}
      {isUnauthorized && (
        <Modal heading="Password" margin="large">
          <FormPassword
            currentUser={currentUser}
            error={passwordError}
            onSubmit={(password) => {
              globalServices.authService.send({
                type: "SET_PASSWORD",
                data: password,
              })
            }}
          />
        </Modal>
      )}
      {isModalViewingListeners && (
        <Modal
          heading={`Listeners (${listeners.length})`}
          onClose={() => hideListeners()}
          margin="large"
        >
          <Box pad="small" overflow="auto">
            <div>
              <UserList
                showHeading={false}
                onEditSettings={() =>
                  globalServices.roomService.send("ADMIN_EDIT_SETTINGS")
                }
                onEditUser={() =>
                  globalServices.roomService.send("EDIT_USERNAME")
                }
              />
            </div>
          </Box>
        </Modal>
      )}
      {isModalViewingHelp && (
        <Modal
          onClose={() => globalServices.roomService.send("CLOSE_VIEWING")}
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

      {isEditingMeta && (
        <Modal onClose={hideEditForm} heading="Set Station Info">
          <FormAdminMeta onSubmit={(value) => socket.emit("fix meta", value)} />
        </Modal>
      )}

      {isEditingArtwork && (
        <Modal onClose={hideEditForm} heading="Set Cover Artwork">
          <FormAdminArtwork
            onSubmit={(value) => socket.emit("set cover", value)}
          />
        </Modal>
      )}

      {isEditingSettings && (
        <Modal onClose={hideEditForm} heading="Settings" width="medium">
          <FormAdminSettings
            onSubmit={(value) => {
              socket.emit("settings", value)
            }}
          />
        </Modal>
      )}

      <Box flex={{ shrink: 0, grow: 0 }} basis="auto">
        <PlayerUi
          onShowPlaylist={() =>
            globalServices.roomService.send("TOGGLE_PLAYLIST")
          }
          hasPlaylist={playlist.length > 0}
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
              filter: isUnauthorized ? "blur(0.5rem)" : "none",
            }}
          >
            <Box flex={true} fill>
              <Listeners
                onEditSettings={() =>
                  globalServices.roomService.send("ADMIN_EDIT_SETTINGS")
                }
                onViewListeners={(view) =>
                  view
                    ? globalServices.roomService.send("VIEW_LISTENERS")
                    : globalServices.roomService.send("CLOSE_VIEWING")
                }
                onEditUser={() =>
                  globalServices.roomService.send("EDIT_USERNAME")
                }
              />
            </Box>
            {!isAdmin && (
              <Box pad="small" align="center" flex={{ grow: 0, shrink: 0 }}>
                <Button
                  size="small"
                  secondary
                  hoverIndicator={{ color: "light-3" }}
                  icon={<HelpOption size="medium" color="brand" />}
                  onClick={() => globalServices.roomService.send("VIEW_HELP")}
                />
              </Box>
            )}
          </Box>
          {isAdmin && (
            <Box pad="medium" flex={{ shrink: 0 }}>
              <Heading level={3} margin={{ bottom: "xsmall" }}>
                Admin
              </Heading>
              <Box gap="small">
                {isNotDj && (
                  <Button
                    label="I am the DJ"
                    onClick={() =>
                      globalServices.roomService.send("START_DJ_SESSION")
                    }
                    primary
                  />
                )}
                {isDj && (
                  <Button
                    label="End DJ Session"
                    onClick={() =>
                      globalServices.roomService.send("END_DJ_SESSION")
                    }
                  />
                )}
                <Button
                  label="Change Cover Art"
                  onClick={() =>
                    globalServices.roomService.send("ADMIN_EDIT_ARTWORK")
                  }
                />

                <Box
                  animation={
                    isEditingSettings
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
                    primary={isEditingSettings ? true : false}
                    icon={<SettingsOption size="small" />}
                    onClick={() =>
                      globalServices.roomService.send("ADMIN_EDIT_SETTINGS")
                    }
                  />
                </Box>
                {isDj && (
                  <Button
                    label="Clear Playlist"
                    primary
                    icon={<List size="small" />}
                    onClick={() => {
                      const confirmation = window.confirm(
                        "Are you sure you want to clear the playlist? This cannot be undone.",
                      )
                      if (confirmation) {
                        globalServices.roomService.send("ADMIN_CLEAR_PLAYLIST")
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
