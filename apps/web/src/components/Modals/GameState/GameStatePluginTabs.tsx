import { Status, Tabs, VStack } from "@chakra-ui/react"
import type { PluginComponentDefinition, PluginTabComponent } from "@repo/types"
import {
  PluginComponentProvider,
  PluginComponentRenderer,
} from "../../PluginComponents/PluginComponentRenderer"
import { getIcon } from "../../PluginComponents/icons"
import { SvgIcon } from "../../ui/svg-icon"

export interface PluginTabEntry {
  id: string
  pluginName: string
  label: string
  icon?: string
  config: Record<string, unknown>
  storeKeys: string[]
  components: PluginComponentDefinition[]
  tab: PluginTabComponent
}

interface GameStatePluginTabTriggersProps {
  tabs: PluginTabEntry[]
  /** Plugin tab ids that appeared since last visit and have not been opened yet */
  unseenTabIds?: ReadonlySet<string>
  /** Also fires for the tab already selected, which `onValueChange` does not. */
  onSelect?: (tabId: string) => void
}

export function GameStatePluginTabTriggers({
  tabs,
  unseenTabIds,
  onSelect,
}: GameStatePluginTabTriggersProps) {
  return (
    <>
      {tabs.map((entry) => {
        const TabIcon = entry.icon ? getIcon(entry.icon) : undefined
        const showNew = unseenTabIds?.has(entry.id) ?? false
        return (
          <Tabs.Trigger
            key={entry.id}
            value={entry.id}
            position="relative"
            gap={1}
            pr={showNew ? 2 : undefined}
            whiteSpace="nowrap"
            onClick={() => onSelect?.(entry.id)}
          >
            {TabIcon ? <SvgIcon icon={TabIcon} boxSize="1em" /> : null}
            {entry.label}
            {showNew ? (
              <Status.Root
                size="sm"
                colorPalette="primary"
                position="absolute"
                top="0"
                right="0"
                pointerEvents="none"
              >
                <Status.Indicator />
              </Status.Root>
            ) : null}
          </Tabs.Trigger>
        )
      })}
    </>
  )
}

interface GameStatePluginTabContentsProps {
  tabs: PluginTabEntry[]
  /** Active tab when the surface fills its height; it fills too if the tab opts in. */
  fillHeightTabId?: string
}

const FILL = { flex: "1", minH: 0, h: "full", display: "flex", flexDirection: "column" } as const
/** Children (each in a renderer wrapper) share the tab's height; each must scroll its own overflow. */
const FILL_CHILDREN = {
  "& > [data-plugin-component-id]": {
    flex: "1",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  },
} as const

export function GameStatePluginTabContents({
  tabs,
  fillHeightTabId,
}: GameStatePluginTabContentsProps) {
  return (
    <>
      {tabs.map((entry) => {
        const fills = entry.tab.fillHeight === true && entry.id === fillHeightTabId
        return (
          <Tabs.Content
            key={entry.id}
            value={entry.id}
            {...(fills ? { ...FILL, overflow: "hidden" } : {})}
          >
            <PluginComponentProvider
              pluginName={entry.pluginName}
              storeKeys={entry.storeKeys}
              config={entry.config}
            >
              <VStack
                align="stretch"
                gap={3}
                pt={2}
                {...(fills ? { ...FILL, css: FILL_CHILDREN } : {})}
              >
                {entry.tab.children.map((child) => (
                  <PluginComponentRenderer key={child.id} component={child} />
                ))}
              </VStack>
            </PluginComponentProvider>
          </Tabs.Content>
        )
      })}
    </>
  )
}
