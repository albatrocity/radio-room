import { useEffect, useMemo } from "react"
import {
  CloseButton,
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogHeader,
  DialogPositioner,
  DialogRoot,
  FloatingPanel,
  Icon,
  IconButton,
  useBreakpointValue,
  VStack,
} from "@chakra-ui/react"
import { getQuickAccessSchema } from "@repo/plugin-config-ui"
import { LuMaximize2, LuMinus, LuSettings, LuSquare, LuX } from "react-icons/lu"
import {
  useIsAdmin,
  useModalsSend,
  usePluginConfigs,
  useQuickAccessPanels,
  useQuickAccessPanelsSend,
} from "../hooks/useActors"
import { usePluginSchemas } from "../hooks/usePluginSchemas"
import { toPluginDisplayName } from "../lib/pluginDisplayName"
import { toPluginSettingsEventType } from "../lib/pluginSettingsEvent"
import { listEnabledQuickAccessPlugins } from "../lib/quickAccessPlugins"
import type { Event as ModalsEvent } from "../machines/modalsMachine"
import PluginConfigForm from "./Modals/Admin/PluginConfigForm"

const PANEL_DEFAULT_SIZE = { width: 320, height: 360 }

function cascadePosition(index: number) {
  const offset = index * 28
  return { x: 48 + offset, y: 72 + offset }
}

function useQuickAccessPanelModel(pluginName: string) {
  const pluginConfigs = usePluginConfigs()
  const { schemas } = usePluginSchemas()
  const modalSend = useModalsSend()

  const pluginSchema = schemas.find((schema) => schema.name === pluginName)
  const configSchema =
    pluginSchema?.configSchema && getQuickAccessSchema(pluginSchema.configSchema)

  if (!configSchema || !pluginSchema) return null

  const title = toPluginDisplayName(pluginName)
  const values = {
    ...(pluginSchema.defaultConfig ?? {}),
    ...(pluginConfigs?.[pluginName] ?? {}),
  }
  const openSettings = () => {
    modalSend({ type: toPluginSettingsEventType(pluginName) } as ModalsEvent)
  }

  return { title, values, configSchema, openSettings }
}

function DesktopPanel({
  pluginName,
  defaultPosition,
}: {
  pluginName: string
  defaultPosition: { x: number; y: number }
}) {
  const send = useQuickAccessPanelsSend()
  const model = useQuickAccessPanelModel(pluginName)
  if (!model) return null

  const { title, values, configSchema, openSettings } = model

  return (
    <FloatingPanel.Root
      open
      onOpenChange={(e) => {
        if (!e.open) send({ type: "CLOSE", pluginName })
      }}
      defaultPosition={defaultPosition}
      defaultSize={PANEL_DEFAULT_SIZE}
      allowOverflow={false}
    >
      <FloatingPanel.Positioner>
        <FloatingPanel.Content>
          <FloatingPanel.Header>
            <FloatingPanel.DragTrigger>
              <FloatingPanel.Title>{title}</FloatingPanel.Title>
            </FloatingPanel.DragTrigger>
            <FloatingPanel.Control>
              <IconButton
                size="xs"
                variant="ghost"
                aria-label={`Open ${title} settings`}
                onClick={openSettings}
              >
                <Icon as={LuSettings} />
              </IconButton>
              <FloatingPanel.StageTrigger stage="minimized" asChild>
                <IconButton size="xs" variant="ghost" aria-label="Minimize">
                  <Icon as={LuMinus} />
                </IconButton>
              </FloatingPanel.StageTrigger>
              <FloatingPanel.StageTrigger stage="maximized" asChild>
                <IconButton size="xs" variant="ghost" aria-label="Maximize">
                  <Icon as={LuMaximize2} />
                </IconButton>
              </FloatingPanel.StageTrigger>
              <FloatingPanel.StageTrigger stage="default" asChild>
                <IconButton size="xs" variant="ghost" aria-label="Restore">
                  <Icon as={LuSquare} />
                </IconButton>
              </FloatingPanel.StageTrigger>
              <FloatingPanel.CloseTrigger asChild>
                <IconButton size="xs" variant="ghost" aria-label={`Close ${title}`}>
                  <Icon as={LuX} />
                </IconButton>
              </FloatingPanel.CloseTrigger>
            </FloatingPanel.Control>
          </FloatingPanel.Header>
          <FloatingPanel.Body>
            <PluginConfigForm
              schema={configSchema}
              values={values}
              allValues={values}
              onChange={() => {}}
              pluginName={pluginName}
            />
          </FloatingPanel.Body>
          <FloatingPanel.ResizeTriggers />
        </FloatingPanel.Content>
      </FloatingPanel.Positioner>
    </FloatingPanel.Root>
  )
}

function MobilePanel({ pluginName }: { pluginName: string }) {
  const send = useQuickAccessPanelsSend()
  const model = useQuickAccessPanelModel(pluginName)
  if (!model) return null

  const { title, values, configSchema, openSettings } = model

  return (
    <DialogRoot
      open
      onOpenChange={(e) => {
        if (!e.open) send({ type: "CLOSE", pluginName })
      }}
      placement="center"
      size="full"
    >
      <DialogBackdrop />
      <DialogPositioner>
        <DialogContent>
          <DialogHeader fontWeight="semibold" pr={16}>
            {title}
          </DialogHeader>
          <IconButton
            size="sm"
            variant="ghost"
            aria-label={`Open ${title} settings`}
            position="absolute"
            top="2"
            right="10"
            onClick={openSettings}
          >
            <Icon as={LuSettings} />
          </IconButton>
          <DialogCloseTrigger asChild position="absolute" top="2" right="2">
            <CloseButton size="sm" />
          </DialogCloseTrigger>
          <DialogBody>
            <VStack align="stretch" gap={4}>
              <PluginConfigForm
                schema={configSchema}
                values={values}
                allValues={values}
                onChange={() => {}}
                pluginName={pluginName}
              />
            </VStack>
          </DialogBody>
        </DialogContent>
      </DialogPositioner>
    </DialogRoot>
  )
}

/**
 * Host for admin Quick Access FloatingPanels / mobile dialogs (ADR 0074).
 * Mount once from Overlays so multiple AdminControls mounts share one panel tree.
 * Stability comes from memo(Overlays), same pattern as memo(Sidebar) for schedule notes.
 */
export default function QuickAccessPanels() {
  const isAdmin = useIsAdmin()
  const panels = useQuickAccessPanels()
  const send = useQuickAccessPanelsSend()
  const pluginConfigs = usePluginConfigs()
  const { schemas, isLoading: schemasLoading } = usePluginSchemas()
  const isSmallScreen = useBreakpointValue({ base: true, md: false }) ?? false

  const enabledPlugins = useMemo(
    () => listEnabledQuickAccessPlugins(schemas, pluginConfigs),
    [schemas, pluginConfigs],
  )

  const enabledPluginNames = useMemo(
    () => enabledPlugins.map((plugin) => plugin.name),
    [enabledPlugins],
  )

  useEffect(() => {
    if (!isAdmin || schemasLoading || schemas.length === 0) return
    send({ type: "PRUNE", enabledPluginNames })
  }, [isAdmin, schemasLoading, schemas.length, enabledPluginNames, send])

  const openNames = useMemo(
    () => Object.entries(panels).filter(([, panel]) => panel.open).map(([name]) => name),
    [panels],
  )

  if (!isAdmin || openNames.length === 0) return null

  if (isSmallScreen) {
    return (
      <>
        {openNames.map((pluginName) => (
          <MobilePanel key={pluginName} pluginName={pluginName} />
        ))}
      </>
    )
  }

  return (
    <>
      {openNames.map((pluginName, index) => (
        <DesktopPanel
          key={pluginName}
          pluginName={pluginName}
          defaultPosition={cascadePosition(index)}
        />
      ))}
    </>
  )
}
