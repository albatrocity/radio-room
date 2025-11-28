import React from "react"

import { useModalsStore } from "../../../state/modalsState"
import {
  Collapse,
  HStack,
  Heading,
  IconButton,
  Modal,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
} from "@chakra-ui/react"
import { ArrowBackIcon } from "@chakra-ui/icons"
import Overview from "./Overview"
import Content from "./Content"
import Chat from "./Chat"
import Password from "./Password"
import ReactionTriggerActions from "./ReactionTriggerActions"
import MessageTriggerActions from "./MessageTriggerActions"
import DjFeatures from "./DjFeatures"
import SpotifyFeatures from "./SpotifyFeatures"
import DynamicPluginSettings from "./DynamicPluginSettings"
import { usePluginSchemas } from "../../../hooks/usePluginSchemas"

const Header = ({ showBack, onBack }: { showBack: boolean; onBack: () => void }) => {
  return (
    <HStack>
      {showBack && (
        <IconButton onClick={onBack} icon={<ArrowBackIcon />} aria-label="back" variant="ghost">
          Back
        </IconButton>
      )}
      <Heading size="lg">Settings</Heading>
    </HStack>
  )
}

function ModalAdminSettings() {
  const { state, send } = useModalsStore()
  const isEditingSettings = useModalsStore((s: any) => s.state.matches("settings"))
  const { schemas } = usePluginSchemas()

  const hideEditForm = () => send("CLOSE")
  const onBack = () => {
    send("BACK")
  }

  const isTriggersView =
    state.matches("settings.reaction_triggers") || state.matches("settings.message_triggers")

  // Convert plugin name to state key (e.g., "playlist-democracy" -> "playlist_democracy")
  const toStateKey = (name: string) => name.split("-").join("_")

  return (
    <Modal isOpen={isEditingSettings} onClose={hideEditForm} size={isTriggersView ? "2xl" : "md"}>
      <ModalOverlay />
      <ModalContent bg="appBg">
        <ModalHeader>
          <Header showBack={!state.matches("settings.overview")} onBack={onBack} />
        </ModalHeader>
        <ModalCloseButton />

        <Collapse in={state.matches("settings.overview")}>
          <Overview />
        </Collapse>
        <Collapse in={state.matches("settings.dj")}>
          <DjFeatures />
        </Collapse>
        <Collapse in={state.matches("settings.content")}>
          <Content />
        </Collapse>
        <Collapse in={state.matches("settings.chat")}>
          <Chat />
        </Collapse>
        <Collapse in={state.matches("settings.password")}>
          <Password />
        </Collapse>

        {/* Dynamic plugin settings */}
        {schemas
          .filter((plugin) => plugin.configSchema)
          .map((plugin) => (
            <Collapse key={plugin.name} in={state.matches(`settings.${toStateKey(plugin.name)}`)}>
              <DynamicPluginSettings pluginName={plugin.name} />
            </Collapse>
          ))}
      </ModalContent>
    </Modal>
  )
}

export default ModalAdminSettings
