import { useModalsSnapshot, useModalsSend } from "../../../hooks/useActors"
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
import Schedule from "./Schedule"
import GameSessions from "./GameSessions"
import DjFeatures from "./DjFeatures"
import DynamicPluginSettings from "./DynamicPluginSettings"
import { usePluginSchemas } from "../../../hooks/usePluginSchemas"

/** XState `matches` typing can lag nested settings substates; keep runtime checks correct. */
function matchesSettingsPath(state: unknown, path: string) {
  return (state as { matches: (p: string) => boolean }).matches(path)
}

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
  const state = useModalsSnapshot()
  const send = useModalsSend()
  const isEditingSettings = state.matches("settings")
  const { schemas } = usePluginSchemas()

  const hideEditForm = () => send({ type: "CLOSE" })
  const onBack = () => {
    send({ type: "BACK" })
  }

  // Convert plugin name to state key (e.g., "playlist-democracy" -> "playlist_democracy")
  const toStateKey = (name: string) => name.split("-").join("_")

  return (
    <DialogRoot
      open={isEditingSettings}
      onOpenChange={(e) => !e.open && hideEditForm()}
      size={"md"}
      placement="center"
    >
      <DialogBackdrop />
      <DialogPositioner>
        <DialogContent bg="appBg">
          <DialogHeader>
            <Header showBack={!matchesSettingsPath(state, "settings.overview")} onBack={onBack} />
          </DialogHeader>
          <DialogCloseTrigger asChild position="absolute" top="2" right="2">
            <CloseButton size="sm" />
          </DialogCloseTrigger>

          <Collapsible.Root open={matchesSettingsPath(state, "settings.overview")}>
            <Collapsible.Content>
              <Overview />
            </Collapsible.Content>
          </Collapsible.Root>
          <Collapsible.Root open={matchesSettingsPath(state, "settings.dj")}>
            <Collapsible.Content>
              <DjFeatures />
            </Collapsible.Content>
          </Collapsible.Root>
          <Collapsible.Root open={matchesSettingsPath(state, "settings.content")}>
            <Collapsible.Content>
              <Content />
            </Collapsible.Content>
          </Collapsible.Root>
          <Collapsible.Root open={matchesSettingsPath(state, "settings.chat")}>
            <Collapsible.Content>
              <Chat />
            </Collapsible.Content>
          </Collapsible.Root>
          <Collapsible.Root open={matchesSettingsPath(state, "settings.password")}>
            <Collapsible.Content>
              <Password />
            </Collapsible.Content>
          </Collapsible.Root>
          <Collapsible.Root open={matchesSettingsPath(state, "settings.schedule")}>
            <Collapsible.Content>
              <Schedule />
            </Collapsible.Content>
          </Collapsible.Root>
          <Collapsible.Root open={matchesSettingsPath(state, "settings.game_sessions")}>
            <Collapsible.Content>
              <GameSessions />
            </Collapsible.Content>
          </Collapsible.Root>

          {/* Dynamic plugin settings */}
          {schemas
            .filter((plugin) => plugin.configSchema)
            .map((plugin) => (
              <Collapsible.Root
                key={plugin.name}
                open={matchesSettingsPath(state, `settings.${toStateKey(plugin.name)}`)}
              >
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
