import {
  Collapsible,
  DialogRoot,
  DialogBackdrop,
  DialogPositioner,
  DialogContent,
  DialogHeader,
  DialogCloseTrigger,
  CloseButton,
  Portal,
} from "@chakra-ui/react"

import { useModalsSnapshot, useModalsSend } from "../../hooks/useActors"
import { useActiveIntegratedPanelSlot } from "../../hooks/useIntegratedPanelPresentation"
import { usePluginSchemas } from "../../hooks/usePluginSchemas"
import { IntegratedPanelShell } from "../IntegratedPanel/IntegratedPanelShell"
import { INTEGRATED_PANEL_SLOTS } from "../../lib/integratedPanelSlots"
import Overview from "./Admin/Overview"
import Content from "./Admin/Content"
import Chat from "./Admin/Chat"
import Password from "./Admin/Password"
import Schedule from "./Admin/Schedule"
import GameSessions from "./Admin/GameSessions"
import Polls from "./Admin/Polls"
import Feedback from "./Admin/Feedback"
import DjFeatures from "./Admin/DjFeatures"
import DynamicPluginSettings from "./Admin/DynamicPluginSettings"
import { AdminSettingsHeader } from "./Admin/AdminSettingsHeader"
import { AdminSettingsDialogContext } from "./Admin/AdminSettingsDialogContext"

/** XState `matches` typing can lag nested settings substates; keep runtime checks correct. */
function matchesSettingsPath(state: unknown, path: string) {
  return (state as { matches: (p: string) => boolean }).matches(`modal.${path}`)
}

export type AdminSettingsSurfaceVariant = "modal" | "panel"

type Props = {
  variant: AdminSettingsSurfaceVariant
}

function AdminSettingsCollapsibleSections() {
  const state = useModalsSnapshot()
  const { schemas } = usePluginSchemas()
  const toStateKey = (name: string) => name.split("-").join("_")

  return (
    <>
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
      <Collapsible.Root open={matchesSettingsPath(state, "settings.polls")}>
        <Collapsible.Content>
          <Polls />
        </Collapsible.Content>
      </Collapsible.Root>
      <Collapsible.Root open={matchesSettingsPath(state, "settings.feedback")}>
        <Collapsible.Content>
          <Feedback />
        </Collapsible.Content>
      </Collapsible.Root>

      {/* Plugin forms: schemas drive the UI. Opening a link still needs a matching
          `EDIT_*` / `settings.{name}` state in modalsMachine (see getting-started.md). */}
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
    </>
  )
}

export function AdminSettingsSurface({ variant }: Props) {
  const state = useModalsSnapshot()
  const send = useModalsSend()
  const activePanelSlot = useActiveIntegratedPanelSlot()
  const isEditingSettings = state.matches("modal.settings")

  const hideEditForm = () => send({ type: "CLOSE" })
  const onBack = () => send({ type: "BACK" })
  const showBack = !matchesSettingsPath(state, "settings.overview")

  if (!isEditingSettings) return null

  const sections = <AdminSettingsCollapsibleSections />

  if (variant === "panel") {
    if (activePanelSlot !== "adminSettings") return null

    return (
      <IntegratedPanelShell
        title={INTEGRATED_PANEL_SLOTS.adminSettings.title}
        onClose={hideEditForm}
        showBack={showBack}
        onBack={onBack}
      >
        <AdminSettingsDialogContext>{sections}</AdminSettingsDialogContext>
      </IntegratedPanelShell>
    )
  }

  if (activePanelSlot === "adminSettings") return null

  return (
    <DialogRoot
      open={isEditingSettings}
      onOpenChange={(e) => !e.open && hideEditForm()}
      size={"md"}
      placement="center"
    >
      <Portal>
        <DialogBackdrop />
        <DialogPositioner>
          <DialogContent bg="appBg">
            <DialogHeader>
              <AdminSettingsHeader showBack={showBack} onBack={onBack} />
            </DialogHeader>
            <DialogCloseTrigger asChild>
              <CloseButton />
            </DialogCloseTrigger>
            {sections}
          </DialogContent>
        </DialogPositioner>
      </Portal>
    </DialogRoot>
  )
}

export default AdminSettingsSurface
