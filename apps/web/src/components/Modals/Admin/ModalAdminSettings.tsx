import React from "react"

import { useModalsStore } from "../../../state/modalsState"
import {
  Collapsible,
  HStack,
  Heading,
  IconButton,
  DialogRoot,
  DialogBackdrop,
  DialogPositioner,
  DialogContent,
  DialogHeader,
  DialogCloseTrigger,
  CloseButton,
} from "@chakra-ui/react"
import { LuArrowLeft } from "react-icons/lu"
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
        <IconButton onClick={onBack} aria-label="back" variant="ghost">
          <LuArrowLeft />
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
    <DialogRoot
      open={isEditingSettings}
      onOpenChange={(e) => !e.open && hideEditForm()}
      size={isTriggersView ? "xl" : "md"}
      placement="center"
    >
      <DialogBackdrop />
      <DialogPositioner>
        <DialogContent bg="appBg">
          <DialogHeader>
            <Header showBack={!state.matches("settings.overview")} onBack={onBack} />
          </DialogHeader>
          <DialogCloseTrigger asChild position="absolute" top="2" right="2">
            <CloseButton size="sm" />
          </DialogCloseTrigger>

          <Collapsible.Root open={state.matches("settings.overview")}>
            <Collapsible.Content>
              <Overview />
            </Collapsible.Content>
          </Collapsible.Root>
          <Collapsible.Root open={state.matches("settings.dj")}>
            <Collapsible.Content>
              <DjFeatures />
            </Collapsible.Content>
          </Collapsible.Root>
          <Collapsible.Root open={state.matches("settings.content")}>
            <Collapsible.Content>
              <Content />
            </Collapsible.Content>
          </Collapsible.Root>
          <Collapsible.Root open={state.matches("settings.chat")}>
            <Collapsible.Content>
              <Chat />
            </Collapsible.Content>
          </Collapsible.Root>
          <Collapsible.Root open={state.matches("settings.password")}>
            <Collapsible.Content>
              <Password />
            </Collapsible.Content>
          </Collapsible.Root>

          {/* Dynamic plugin settings */}
          {schemas
            .filter((plugin) => plugin.configSchema)
            .map((plugin) => (
              <Collapsible.Root key={plugin.name} open={state.matches(`settings.${toStateKey(plugin.name)}`)}>
                <Collapsible.Content>
                  <DynamicPluginSettings pluginName={plugin.name} />
                </Collapsible.Content>
              </Collapsible.Root>
            ))}
        </DialogContent>
      </DialogPositioner>
    </DialogRoot>
  )
}

export default ModalAdminSettings
