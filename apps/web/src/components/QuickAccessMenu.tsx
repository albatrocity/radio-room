import { useMemo } from "react"
import {
  Box,
  Button,
  HStack,
  Icon,
  IconButton,
  Menu,
  Portal,
  RecipeProps,
  Text,
} from "@chakra-ui/react"
import { LuCheck, LuPanelTop, LuZap } from "react-icons/lu"
import {
  usePluginConfigs,
  useQuickAccessPanels,
  useQuickAccessPanelsSend,
} from "../hooks/useActors"
import { usePluginSchemas } from "../hooks/usePluginSchemas"
import { toPluginDisplayName } from "../lib/pluginDisplayName"
import { listEnabledQuickAccessPlugins } from "../lib/quickAccessPlugins"

type ButtonVariant = RecipeProps<"button">["variant"]

type Props = {
  buttonColorScheme?: string
  buttonVariant?: ButtonVariant
}

function QuickAccessMenuItems({
  plugins,
  panels,
  onToggle,
}: {
  plugins: { name: string }[]
  panels: Record<string, { open?: boolean } | undefined>
  onToggle: (pluginName: string) => void
}) {
  return (
    <>
      {plugins.map((plugin) => {
        const open = panels[plugin.name]?.open === true
        return (
          <Menu.Item
            key={plugin.name}
            value={plugin.name}
            closeOnSelect={false}
            onClick={() => onToggle(plugin.name)}
          >
            <HStack justify="space-between" w="100%" gap={3}>
              <Text>{toPluginDisplayName(plugin.name)}</Text>
              {open && <Icon as={LuCheck} aria-label="Panel open" />}
            </HStack>
          </Menu.Item>
        )
      })}
    </>
  )
}

/** Admin Quick Access plugin picker — portalled menu overlay (ADR 0072). */
export default function QuickAccessMenu({ buttonColorScheme, buttonVariant = "subtle" }: Props) {
  const pluginConfigs = usePluginConfigs()
  const panels = useQuickAccessPanels()
  const quickAccessSend = useQuickAccessPanelsSend()
  const { schemas } = usePluginSchemas()

  const quickAccessPlugins = useMemo(
    () => listEnabledQuickAccessPlugins(schemas, pluginConfigs),
    [schemas, pluginConfigs],
  )

  if (quickAccessPlugins.length === 0) return null

  const anyQuickAccessOpen = quickAccessPlugins.some((plugin) => panels[plugin.name]?.open)
  const toggle = (pluginName: string) => quickAccessSend({ type: "TOGGLE", pluginName })

  return (
    <>
      <Box hideBelow="sm">
        <Menu.Root positioning={{ placement: "top-start", gutter: 4 }}>
          <Menu.Trigger asChild>
            <Button
              size="xs"
              variant={anyQuickAccessOpen ? "solid" : buttonVariant}
              colorPalette={buttonColorScheme}
              aria-pressed={anyQuickAccessOpen}
            >
              <Icon as={LuZap} />
              Quick access
            </Button>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content minW="220px">
                <QuickAccessMenuItems
                  plugins={quickAccessPlugins}
                  panels={panels}
                  onToggle={toggle}
                />
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      </Box>
      <Box hideFrom="sm">
        <Menu.Root positioning={{ placement: "top-start", gutter: 4 }}>
          <Menu.Trigger asChild>
            <IconButton
              size="md"
              variant={anyQuickAccessOpen ? "solid" : buttonVariant}
              colorPalette={buttonColorScheme}
              aria-label="Quick access"
              aria-pressed={anyQuickAccessOpen}
            >
              <Icon as={LuPanelTop} />
            </IconButton>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content minW="220px">
                <QuickAccessMenuItems
                  plugins={quickAccessPlugins}
                  panels={panels}
                  onToggle={toggle}
                />
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      </Box>
    </>
  )
}
