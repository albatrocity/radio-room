import { useEffect, useMemo, useState } from "react"
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
  Portal,
  useBreakpointValue,
  VStack,
} from "@chakra-ui/react"
import { getQuickAccessSchema, getQuickAccessStatusFields } from "@repo/plugin-config-ui/logic"
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

/**
 * Chakra FloatingPanel defaults to zIndex.popover and bumps +100 when topmost,
 * which paints above Dialog (also popover). Modal dialogs set body
 * pointer-events:none, so the panel looks clickable but hits fall through.
 * Keep panels in the overlay band so dialogs own the top layer.
 */
const PANEL_POSITIONER_CSS = {
  "--floating-panel-z-index": "{zIndex.overlay}",
} as const

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
  const values = useMemo(
    () => ({
      ...(pluginSchema.defaultConfig ?? {}),
      ...(pluginConfigs?.[pluginName] ?? {}),
    }),
    [pluginSchema, pluginConfigs, pluginName],
  )
  const openSettings = () => {
    modalSend({ type: toPluginSettingsEventType(pluginName) } as ModalsEvent)
  }

  const readOnlyFields =
    pluginSchema.configSchema && getQuickAccessStatusFields(pluginSchema.configSchema)

  return { title, values, configSchema, readOnlyFields, openSettings }
}

function QuickAccessPanelForm({
  pluginName,
  configSchema,
  baseValues,
  readOnlyFields,
}: {
  pluginName: string
  configSchema: NonNullable<ReturnType<typeof getQuickAccessSchema>>
  baseValues: Record<string, unknown>
  readOnlyFields?: string[]
}) {
  const [localPatch, setLocalPatch] = useState<Record<string, unknown>>({})

  const baseValuesKey = JSON.stringify(baseValues)

  useEffect(() => {
    setLocalPatch({})
  }, [baseValuesKey])

  const values = { ...baseValues, ...localPatch }

  return (
    <PluginConfigForm
      schema={configSchema}
      values={values}
      allValues={values}
      readOnlyFields={readOnlyFields}
      onChange={(field, value) => setLocalPatch((prev) => ({ ...prev, [field]: value }))}
      pluginName={pluginName}
    />
  )
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

  const { title, values, configSchema, readOnlyFields, openSettings } = model

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
      <Portal>
        <FloatingPanel.Positioner css={PANEL_POSITIONER_CSS}>
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
              <QuickAccessPanelForm
                pluginName={pluginName}
                configSchema={configSchema}
                baseValues={values}
                readOnlyFields={readOnlyFields}
              />
            </FloatingPanel.Body>
            <FloatingPanel.ResizeTriggers />
          </FloatingPanel.Content>
        </FloatingPanel.Positioner>
      </Portal>
    </FloatingPanel.Root>
  )
}

function MobilePanel({ pluginName }: { pluginName: string }) {
  const send = useQuickAccessPanelsSend()
  const model = useQuickAccessPanelModel(pluginName)
  if (!model) return null

  const { title, values, configSchema, readOnlyFields, openSettings } = model

  return (
    <DialogRoot
      open
      onOpenChange={(e) => {
        if (!e.open) send({ type: "CLOSE", pluginName })
      }}
      placement="center"
      size="full"
    >
      <Portal>
        <DialogBackdrop />
        <DialogPositioner>
          <DialogContent>
            <DialogHeader fontWeight="semibold" pe="24">
              {title}
            </DialogHeader>
            <IconButton
              size="md"
              variant="ghost"
              aria-label={`Open ${title} settings`}
              position="absolute"
              top="2"
              right="12"
              minW="44px"
              minH="44px"
              onClick={openSettings}
            >
              <Icon as={LuSettings} />
            </IconButton>
            <DialogCloseTrigger asChild>
              <CloseButton />
            </DialogCloseTrigger>
            <DialogBody>
              <VStack align="stretch" gap={4}>
                <QuickAccessPanelForm
                  pluginName={pluginName}
                  configSchema={configSchema}
                  baseValues={values}
                  readOnlyFields={readOnlyFields}
                />
              </VStack>
            </DialogBody>
          </DialogContent>
        </DialogPositioner>
      </Portal>
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
