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
}

export function GameStatePluginTabContents({ tabs }: GameStatePluginTabContentsProps) {
  return (
    <>
      {tabs.map((entry) => (
        <Tabs.Content key={entry.id} value={entry.id}>
          <PluginComponentProvider
            pluginName={entry.pluginName}
            storeKeys={entry.storeKeys}
            config={entry.config}
          >
            <VStack align="stretch" gap={3} pt={2}>
              {entry.tab.children.map((child) => (
                <PluginComponentRenderer key={child.id} component={child} />
              ))}
            </VStack>
          </PluginComponentProvider>
        </Tabs.Content>
      ))}
    </>
  )
}
