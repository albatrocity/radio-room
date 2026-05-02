import { Icon, Tabs, VStack } from "@chakra-ui/react"
import type { PluginComponentDefinition, PluginTabComponent } from "@repo/types"
import {
  PluginComponentProvider,
  PluginComponentRenderer,
} from "../../PluginComponents/PluginComponentRenderer"
import { getIcon } from "../../PluginComponents/icons"

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
}

export function GameStatePluginTabTriggers({ tabs }: GameStatePluginTabTriggersProps) {
  return (
    <>
      {tabs.map((entry) => {
        const TabIcon = entry.icon ? getIcon(entry.icon) : undefined
        return (
          <Tabs.Trigger key={entry.id} value={entry.id}>
            {TabIcon ? <Icon as={TabIcon} /> : null}
            {entry.label}
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
            components={entry.components}
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
