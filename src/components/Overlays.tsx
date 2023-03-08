import React, { useCallback } from "react"
import { Box, Hide } from "@chakra-ui/react"

import FormAdminMeta from "./FormAdminMeta"
import FormAdminArtwork from "./FormAdminArtwork"
import FormAdminSettings from "./FormAdminSettings"

import Modal from "./Modal"
import Drawer from "./Drawer"
import FormTheme from "./FormTheme"

import DrawerBookmarks from "./Drawers/DrawerBookmarks"
import DrawerPlaylist from "./Drawers/DrawerPlaylist"
import DrawerListeners from "./Drawers/DrawerListeners"

import useGlobalContext from "./useGlobalContext"
import { useSelector } from "@xstate/react"
import ModalEditUsername from "./Modals/ModalEditUsername"
import ModalPassword from "./Modals/ModalPassword"
import ModalAbout from "./Modals/ModalAbout"
import ModalAddToQueue from "./Modals/ModalAddToQueue"

const isEditingMetaSelector = (state) =>
  state.matches("connected.participating.editing.meta")
const isEditingArtworkSelector = (state) =>
  state.matches("connected.participating.editing.artwork")
const isEditingSettingsSelector = (state) =>
  state.matches("connected.participating.editing.settings")
const isEditingPreferencesSelector = (state) =>
  state.matches("connected.participating.editing.preferences")

type Props = {}

function Overlays({}: Props) {
  const globalServices = useGlobalContext()

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
  const isEditingPreferences = useSelector(
    globalServices.roomService,
    isEditingPreferencesSelector,
  )

  const hideEditForm = useCallback(
    () => globalServices.roomService.send("CLOSE_EDIT"),
    [globalServices],
  )

  return (
    <div>
      <DrawerPlaylist />
      <DrawerBookmarks />

      <Hide above="sm">
        <DrawerListeners />
      </Hide>

      <ModalEditUsername />
      <ModalPassword />
      <ModalAbout />
      <ModalAddToQueue />

      <Modal
        isOpen={isEditingPreferences}
        onClose={hideEditForm}
        heading="Preferences"
      >
        <FormTheme />
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
    </div>
  )
}

export default Overlays
