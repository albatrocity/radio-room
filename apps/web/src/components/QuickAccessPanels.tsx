import { memo, useEffect, useMemo, useRef } from "react"
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
import { useSelector } from "@xstate/react"
import { getQuickAccessSchema } from "@repo/plugin-config-ui"
import { LuMaximize2, LuMinus, LuSettings, LuSquare, LuX } from "react-icons/lu"
import {
  getQuickAccessPanels,
  quickAccessPanelsActor,
} from "../actors/quickAccessPanelsActor"
import {
  useIsAdmin,
  useModalsSend,
  usePluginConfigs,
  useQuickAccessPanelsSend,
} from "../hooks/useActors"
import { usePluginSchemas } from "../hooks/usePluginSchemas"
import { toPluginDisplayName } from "../lib/pluginDisplayName"
import { toPluginSettingsEventType } from "../lib/pluginSettingsEvent"
import { QUICK_ACCESS_DEFAULT_SIZE } from "../machines/quickAccessPanelsMachine"
import type { Event as ModalsEvent } from "../machines/modalsMachine"
import PluginConfigForm from "./Modals/Admin/PluginConfigForm"

function useOpenPluginSettings(pluginName: string) {
  const modalSend = useModalsSend()
  return () => {
    modalSend({ type: toPluginSettingsEventType(pluginName) } as ModalsEvent)
  }
}

/**
 * Stable open-set fingerprint. Geometry-only SET_GEOMETRY updates must not change this,
 * so the host can re-render without remounting/re-rendering FloatingPanel roots.
 */
function selectOpenPluginNamesKey(state: {
  context: { panels: Record<string, { open?: boolean } | undefined> }
}): string {
  return Object.entries(state.context.panels)
    .filter(([, panel]) => panel?.open === true)
    .map(([name]) => name)
    .sort()
    .join("\0")
}

function PanelBody({
  pluginName,
  configSchema,
  values,
}: {
  pluginName: string
  configSchema: NonNullable<ReturnType<typeof getQuickAccessSchema>>
  values: Record<string, unknown>
}) {
  return (
    <PluginConfigForm
      schema={configSchema}
      values={values}
      allValues={values}
      onChange={() => {}}
      pluginName={pluginName}
    />
  )
}

/**
 * Self-contained desktop panel. Only takes `pluginName` so React.memo can skip re-renders
 * when Room/Overlays update (nowPlaying, listeners, etc.).
 *
 * RoomSchedulePanel's FloatingPanels stay interactive because they live under memo(Sidebar).
 * Quick Access mounts from Overlays (not memoized), so without this isolation zag's
 * drag/resize/minimize state is torn down by constant parent re-renders.
 */
const DesktopPanel = memo(function DesktopPanel({ pluginName }: { pluginName: string }) {
  const send = useQuickAccessPanelsSend()
  const openPluginSettings = useOpenPluginSettings(pluginName)
  const pluginConfigs = usePluginConfigs()
  const { schemas } = usePluginSchemas()

  const pluginSchema = schemas.find((schema) => schema.name === pluginName)
  const configSchema =
    pluginSchema?.configSchema && getQuickAccessSchema(pluginSchema.configSchema)

  // Mount-only geometry — never read live actor size/position back into FloatingPanel props.
  const initialGeometryRef = useRef<{
    position: { x: number; y: number }
    size: { width: number; height: number }
  } | null>(null)
  if (initialGeometryRef.current === null) {
    const panel = getQuickAccessPanels()[pluginName]
    initialGeometryRef.current = {
      position: panel?.position ?? { x: 48, y: 72 },
      size: panel?.size ?? { ...QUICK_ACCESS_DEFAULT_SIZE },
    }
  }

  if (!configSchema || !pluginSchema) return null

  const title = toPluginDisplayName(pluginName)
  const values = {
    ...(pluginSchema.defaultConfig ?? {}),
    ...(pluginConfigs?.[pluginName] ?? {}),
  }

  return (
    <FloatingPanel.Root
      open
      onOpenChange={(e) => {
        if (!e.open) send({ type: "CLOSE", pluginName })
      }}
      defaultPosition={initialGeometryRef.current.position}
      defaultSize={initialGeometryRef.current.size}
      allowOverflow={false}
      onPositionChangeEnd={(details) => {
        send({ type: "SET_GEOMETRY", pluginName, position: details.position })
      }}
      onSizeChangeEnd={(details) => {
        send({ type: "SET_GEOMETRY", pluginName, size: details.size })
      }}
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
                onClick={openPluginSettings}
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
            <PanelBody pluginName={pluginName} configSchema={configSchema} values={values} />
          </FloatingPanel.Body>
          <FloatingPanel.ResizeTriggers />
        </FloatingPanel.Content>
      </FloatingPanel.Positioner>
    </FloatingPanel.Root>
  )
})

const MobilePanel = memo(function MobilePanel({ pluginName }: { pluginName: string }) {
  const send = useQuickAccessPanelsSend()
  const openPluginSettings = useOpenPluginSettings(pluginName)
  const pluginConfigs = usePluginConfigs()
  const { schemas } = usePluginSchemas()

  const pluginSchema = schemas.find((schema) => schema.name === pluginName)
  const configSchema =
    pluginSchema?.configSchema && getQuickAccessSchema(pluginSchema.configSchema)

  if (!configSchema || !pluginSchema) return null

  const title = toPluginDisplayName(pluginName)
  const values = {
    ...(pluginSchema.defaultConfig ?? {}),
    ...(pluginConfigs?.[pluginName] ?? {}),
  }

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
            onClick={openPluginSettings}
          >
            <Icon as={LuSettings} />
          </IconButton>
          <DialogCloseTrigger asChild position="absolute" top="2" right="2">
            <CloseButton size="sm" />
          </DialogCloseTrigger>
          <DialogBody>
            <VStack align="stretch" gap={4}>
              <PanelBody pluginName={pluginName} configSchema={configSchema} values={values} />
            </VStack>
          </DialogBody>
        </DialogContent>
      </DialogPositioner>
    </DialogRoot>
  )
})

/**
 * Host for admin Quick Access FloatingPanels / mobile dialogs (ADR 0072).
 * Mount once from Overlays so multiple AdminControls mounts share one panel tree.
 */
export default function QuickAccessPanels() {
  const isAdmin = useIsAdmin()
  const openKey = useSelector(quickAccessPanelsActor, selectOpenPluginNamesKey)
  const send = useQuickAccessPanelsSend()
  const pluginConfigs = usePluginConfigs()
  const { schemas, isLoading: schemasLoading } = usePluginSchemas()
  const isSmallScreen = useBreakpointValue({ base: true, md: false }) ?? false

  const enabledQuickAccessKey = useMemo(() => {
    return schemas
      .filter((plugin) => {
        const schema = plugin.configSchema
        if (!schema?.quickAccess?.length) return false
        if (!getQuickAccessSchema(schema)) return false
        return pluginConfigs?.[plugin.name]?.enabled === true
      })
      .map((plugin) => plugin.name)
      .sort()
      .join("\0")
  }, [schemas, pluginConfigs])

  useEffect(() => {
    if (!isAdmin || schemasLoading || schemas.length === 0) return
    send({
      type: "PRUNE",
      enabledPluginNames: enabledQuickAccessKey ? enabledQuickAccessKey.split("\0") : [],
    })
  }, [isAdmin, schemasLoading, schemas.length, enabledQuickAccessKey, send])

  const openNames = useMemo(
    () => (openKey ? openKey.split("\0") : []),
    [openKey],
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
      {openNames.map((pluginName) => (
        <DesktopPanel key={pluginName} pluginName={pluginName} />
      ))}
    </>
  )
}
