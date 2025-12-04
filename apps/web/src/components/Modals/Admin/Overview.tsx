import { LuChevronRight } from "react-icons/lu"
import { useSettingsStore } from "../../../state/settingsStore"
import {
  Box,
  Button,
  HStack,
  Heading,
  DialogBody,
  DialogFooter,
  VStack,
  Separator,
  Spinner,
} from "@chakra-ui/react"
import { useModalsStore } from "../../../state/modalsState"
import { usePluginSchemas } from "../../../hooks/usePluginSchemas"
import ActiveIndicator from "../../ActiveIndicator"
import DestructiveActions from "./DestructiveActions"
import ButtonRoomAuthSpotify from "../../ButtonRoomAuthSpotify"

/**
 * Convert plugin name to a display-friendly title
 * e.g., "playlist-democracy" -> "Playlist Democracy"
 */
function toDisplayName(name: string): string {
  return name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

/**
 * Convert plugin name to event name for modal state machine
 * e.g., "playlist-democracy" -> "EDIT_PLAYLIST_DEMOCRACY"
 */
function toEventName(name: string): string {
  return `EDIT_${name.replace(/-/g, "_").toUpperCase()}`
}

function Overview() {
  const { send } = useModalsStore()
  const { state: settingsState } = useSettingsStore()
  const { schemas, isLoading } = usePluginSchemas()

  const hasPassword = !!settingsState.context.password
  const hasSettings =
    !!settingsState.context.extraInfo ||
    !!settingsState.context.artwork ||
    !!settingsState.context.radioMetaUrl
  const hasChatSettings =
    settingsState.context.announceNowPlaying ?? settingsState.context.announceUsernameChanges
  const hasDjSettings = settingsState.context.deputizeOnJoin

  // Check if a plugin is active based on its 'enabled' config
  const isPluginActive = (pluginName: string): boolean => {
    const pluginConfig = settingsState.context.pluginConfigs?.[pluginName]
    return pluginConfig?.enabled === true
  }

  // Filter plugins that have a configSchema
  const configurablePlugins = schemas.filter((p) => p.configSchema)

  return (
    <Box>
      <DialogBody>
        <VStack align="left" gap={6}>
          <VStack align="left" gap={2}>
            <Heading as="h4" size="sm" textAlign="left">
              Content & Auth
            </Heading>
            <VStack w="100%" align="left" gap="1px">
              <Button
                variant="ghost"
                bg="secondaryBg"
                borderRadius="lg"
                borderBottomRadius="none"
                w="100%"
                textAlign="left"
                fontWeight="400"
                justifyContent="space-between"
                onClick={() => send("EDIT_CONTENT")}
              >
                Content
                <HStack>
                  {hasSettings && <ActiveIndicator />}
                  <LuChevronRight />
                </HStack>
              </Button>
              <Button
                variant="ghost"
                bg="secondaryBg"
                borderRadius="none"
                w="100%"
                textAlign="left"
                fontWeight="400"
                justifyContent="space-between"
                onClick={() => send("EDIT_CHAT")}
              >
                Chat
                <HStack>
                  {hasChatSettings && <ActiveIndicator />}
                  <LuChevronRight />
                </HStack>
              </Button>
              <Button
                variant="ghost"
                bg="secondaryBg"
                borderRadius="none"
                w="100%"
                textAlign="left"
                fontWeight="400"
                justifyContent="space-between"
                onClick={() => send("EDIT_DJ")}
              >
                DJ Features
                <HStack>
                  {hasDjSettings && <ActiveIndicator />}
                  <LuChevronRight />
                </HStack>
              </Button>
              <Button
                variant="ghost"
                bg="secondaryBg"
                borderRadius="lg"
                borderTopRadius="none"
                w="100%"
                textAlign="left"
                fontWeight="400"
                justifyContent="space-between"
                onClick={() => send("EDIT_PASSWORD")}
              >
                Password Protection
                <HStack>
                  {hasPassword && <ActiveIndicator />}
                  <LuChevronRight />
                </HStack>
              </Button>
            </VStack>
          </VStack>

          <VStack align="left" gap={2}>
            <Heading as="h4" size="sm" textAlign="left">
              Plugins
            </Heading>
            <VStack w="100%" align="left" gap="1px">
              {isLoading ? (
                <HStack py={2} px={4}>
                  <Spinner size="sm" />
                </HStack>
              ) : configurablePlugins.length === 0 ? (
                <Box py={2} px={4} color="gray.500" fontSize="sm">
                  No configurable plugins available
                </Box>
              ) : (
                configurablePlugins.map((plugin, index) => (
                  <Button
                    key={plugin.name}
                    variant="ghost"
                    bg="secondaryBg"
                    w="100%"
                    textAlign="left"
                    fontWeight="400"
                    justifyContent="space-between"
                    borderRadius={
                      index === 0
                        ? "lg"
                        : index === configurablePlugins.length - 1
                        ? "lg"
                        : "none"
                    }
                    borderTopRadius={index === 0 ? undefined : "none"}
                    borderBottomRadius={
                      index === configurablePlugins.length - 1 ? undefined : "none"
                    }
                    onClick={() => send(toEventName(plugin.name) as any)}
                  >
                    {toDisplayName(plugin.name)}
                    <HStack>
                      {isPluginActive(plugin.name) && <ActiveIndicator />}
                      <LuChevronRight />
                    </HStack>
                  </Button>
                ))
              )}
            </VStack>
          </VStack>

          <VStack w="100%" align="left" gap={2}>
            <Heading as="h4" size="sm" textAlign="left">
              Authentication
            </Heading>
            <ButtonRoomAuthSpotify />
          </VStack>
        </VStack>
        <Separator my={6} />
        <VStack w="100%" align="left" gap={2}>
          <Heading as="h4" size="sm" textAlign="left" color="red">
            Danger Zone
          </Heading>
          <DestructiveActions />
        </VStack>
      </DialogBody>
      <DialogFooter />
    </Box>
  )
}

export default Overview
