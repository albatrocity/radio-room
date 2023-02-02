import React, { useCallback, useEffect } from "react"
import { useSelector } from "@xstate/react"
import Konami from "react-konami-code"

import { Box, Grid, GridItem } from "@chakra-ui/react"

import FormAdminMeta from "./FormAdminMeta"
import FormAdminArtwork from "./FormAdminArtwork"
import FormAdminSettings from "./FormAdminSettings"
import PlayerUi from "./PlayerUi"
import Playlist from "./Playlist"
import FormUsername from "./FormUsername"
import FormPassword from "./FormPassword"
import Chat from "./Chat"
import UserList from "./UserList"
import Modal from "./Modal"
import Drawer from "./Drawer"
import Sidebar from "./Sidebar"
import AboutContent from "./AboutContent"
import socket from "../lib/socket"
import useGlobalContext from "./useGlobalContext"

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
const playlistSelector = (state) => state.context.playlist
const isAdminSelector = (state) => state.context.isAdmin
const isNewUserSelector = (state) => state.context.isNewUser
const isUnauthorizedSelector = (state) => state.matches("unauthorized")
const currentUserSelector = (state) => state.context.currentUser
const passwordErrorSelector = (state) => state.context.passwordError
const listenersSelector = (state) => state.context.listeners

const Room = () => {
  const globalServices = useGlobalContext()
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

  const playlist = useSelector(globalServices.roomService, playlistSelector)

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
    <Grid
      flexGrow={1}
      flexShrink={1}
      className="room"
      templateAreas={[
        `"header header"
      "chat chat"
      "sidebar sidebar"`,
        `
    "header header"
    "chat sidebar"
    `,
      ]}
      gridTemplateRows={"auto 1fr"}
      gridTemplateColumns={"1fr auto"}
    >
      <Konami
        action={() => globalServices.roomService.send("ACTIVATE_ADMIN")}
      />

      <GridItem area="header">
        <PlayerUi
          onShowPlaylist={() =>
            globalServices.roomService.send("TOGGLE_PLAYLIST")
          }
          hasPlaylist={playlist.length > 0}
          onReactionClick={toggleReaction}
          onOpenReactionPicker={onOpenReactionPicker}
        />
      </GridItem>

      <GridItem area="chat" minHeight={0}>
        <Chat
          modalActive={isEditing}
          onOpenReactionPicker={onOpenReactionPicker}
          onReactionClick={toggleReaction}
        />
      </GridItem>
      <GridItem area="sidebar" h="100%">
        <Sidebar />
      </GridItem>

      <Drawer
        isOpen={playlistActive}
        placement="left"
        heading="Playlist"
        size={["full", "lg"]}
        onClose={() => globalServices.roomService.send("TOGGLE_PLAYLIST")}
      >
        <Playlist data={playlist} />
      </Drawer>

      <FormUsername
        isOpen={isEditingUsername}
        currentUser={currentUser}
        onClose={hideEditForm}
        onSubmit={(username) => {
          globalServices.authService.send({
            type: "UPDATE_USERNAME",
            data: username,
          })
          hideEditForm()
        }}
      />

      <FormPassword
        isOpen={isUnauthorized}
        error={passwordError}
        onSubmit={(password) => {
          globalServices.authService.send({
            type: "SET_PASSWORD",
            data: password,
          })
        }}
      />

      <Modal
        isOpen={isModalViewingListeners}
        heading={`Listeners (${listeners.length})`}
        onClose={() => hideListeners()}
      >
        <Box p="sm" overflow="auto">
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

      <Modal
        isOpen={isModalViewingHelp}
        onClose={() => globalServices.roomService.send("CLOSE_VIEWING")}
        heading="???"
      >
        <AboutContent />
      </Modal>

      <Modal
        isOpen={isEditingMeta}
        onClose={hideEditForm}
        heading="Set Station Info"
      >
        <FormAdminMeta onSubmit={(value) => socket.emit("fix meta", value)} />
      </Modal>

      <Modal
        isOpen={isEditingArtwork}
        onClose={hideEditForm}
        heading="Set Cover Artwork"
      >
        <FormAdminArtwork
          onSubmit={(value) => socket.emit("set cover", value)}
        />
      </Modal>

      <FormAdminSettings
        isOpen={isEditingSettings}
        onClose={hideEditForm}
        onSubmit={(value) => {
          socket.emit("settings", value)
        }}
      />
    </Grid>
  )
}

export default Room
