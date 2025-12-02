import { ChevronRightIcon } from "@chakra-ui/icons"
import { useSettingsStore } from "../../../state/settingsStore"
import {
  Box,
  Button,
  HStack,
  Heading,
  ModalBody,
  ModalFooter,
  VStack,
  Divider,
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
      <ModalBody>
        <VStack align="left" spacing={6}>
          <VStack align="left" spacing={2}>
            <Heading as="h4" size="sm" textAlign="left">
              Content & Auth
            </Heading>
            <VStack w="100%" align="left" spacing="1px">
              <Button
                rightIcon={
                  <HStack>
                    {hasSettings && <ActiveIndicator />}
                    <ChevronRightIcon />
                  </HStack>
                }
                variant="settingsCategory"
                borderBottomRadius="none"
                onClick={() => send("EDIT_CONTENT")}
              >
                Content
              </Button>
              <Button
                rightIcon={
                  <HStack>
                    {hasChatSettings && <ActiveIndicator />}
                    <ChevronRightIcon />
                  </HStack>
                }
                variant="settingsCategory"
                borderRadius="none"
                onClick={() => send("EDIT_CHAT")}
              >
                Chat
              </Button>
              <Button
                rightIcon={
                  <HStack>
                    {hasDjSettings && <ActiveIndicator />}
                    <ChevronRightIcon />
                  </HStack>
                }
                variant="settingsCategory"
                borderRadius="none"
                onClick={() => send("EDIT_DJ")}
              >
                DJ Features
              </Button>
              <Button
                rightIcon={
                  <HStack>
                    {hasPassword && <ActiveIndicator />}
                    <ChevronRightIcon />
                  </HStack>
                }
                variant="settingsCategory"
                borderTopRadius="none"
                onClick={() => send("EDIT_PASSWORD")}
              >
                Password Protection
              </Button>
            </VStack>
          </VStack>

          <VStack align="left" spacing={2}>
            <Heading as="h4" size="sm" textAlign="left">
              Plugins
            </Heading>
            <VStack w="100%" align="left" spacing="1px">
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
                    rightIcon={
                      <HStack>
                        {isPluginActive(plugin.name) && <ActiveIndicator />}
                        <ChevronRightIcon />
                      </HStack>
                    }
                    variant="settingsCategory"
                    borderTopRadius={index === 0 ? undefined : "none"}
                    borderBottomRadius={
                      index === configurablePlugins.length - 1 ? undefined : "none"
                    }
                    onClick={() => send(toEventName(plugin.name) as any)}
                  >
                    {toDisplayName(plugin.name)}
                  </Button>
                ))
              )}
            </VStack>
          </VStack>

          <VStack w="100%" align="left" spacing={2}>
            <Heading as="h4" size="sm" textAlign="left">
              Authentication
            </Heading>
            <ButtonRoomAuthSpotify />
          </VStack>
        </VStack>
        <Divider my={6} />
        <VStack w="100%" align="left" spacing={2}>
          <Heading as="h4" size="sm" textAlign="left" color="red">
            Danger Zone
          </Heading>
          <DestructiveActions />
        </VStack>
      </ModalBody>
      <ModalFooter />
    </Box>
  )
}

export default Overview
