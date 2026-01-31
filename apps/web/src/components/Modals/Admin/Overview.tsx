import { useRef } from "react"
import { LuChevronRight, LuDownload, LuUpload } from "react-icons/lu"
import { useSettings, useModalsSend, useAdminSend } from "../../../hooks/useActors"
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
  Input,
  Text,
} from "@chakra-ui/react"
import { usePluginSchemas } from "../../../hooks/usePluginSchemas"
import ActiveIndicator from "../../ActiveIndicator"
import DestructiveActions from "./DestructiveActions"
import ButtonRoomAuthSpotify from "../../ButtonRoomAuthSpotify"
import ButtonRoomAuthTidal from "../../ButtonRoomAuthTidal"
import { exportPreset, importPreset } from "../../../lib/pluginPresets"
import { toaster } from "../../ui/toaster"

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
  const send = useModalsSend()
  const adminSend = useAdminSend()
  const settings = useSettings()
  const { schemas, isLoading } = usePluginSchemas()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const hasPassword = !!settings.password
  const hasSettings = !!settings.extraInfo || !!settings.artwork || !!settings.radioMetaUrl
  const hasChatSettings = settings.announceNowPlaying ?? settings.announceUsernameChanges
  const hasDjSettings = settings.deputizeOnJoin

  // Check if a plugin is active based on its 'enabled' config
  const isPluginActive = (pluginName: string): boolean => {
    const pluginConfig = settings.pluginConfigs?.[pluginName]
    return pluginConfig?.enabled === true
  }

  // Filter plugins that have a configSchema
  const configurablePlugins = schemas.filter((p) => p.configSchema)

  // Check if there are any plugin configs to export
  const hasPluginConfigs =
    settings.pluginConfigs && Object.keys(settings.pluginConfigs).length > 0

  const handleExportPreset = () => {
    const presetName = settings.title ? `${settings.title} Preset` : "Plugin Preset"
    exportPreset(settings.pluginConfigs || {}, presetName)
    toaster.create({
      title: "Preset exported",
      description: "Your plugin configuration has been downloaded",
      type: "success",
      duration: 3000,
    })
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const result = await importPreset(file)

    if (!result.valid || !result.preset) {
      toaster.create({
        title: "Import failed",
        description: result.error || "Invalid preset file",
        type: "error",
        duration: 5000,
      })
      // Reset the input so the same file can be selected again
      event.target.value = ""
      return
    }

    // Apply the imported configs
    adminSend({
      type: "SET_SETTINGS",
      data: {
        pluginConfigs: result.preset.pluginConfigs,
      },
    })

    toaster.create({
      title: "Preset imported",
      description: `Applied "${result.preset.presetName}" configuration`,
      type: "success",
      duration: 3000,
    })

    // Reset the input
    event.target.value = ""
  }

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
                colorPalette="action"
                variant="subtle"
                borderRadius="lg"
                borderBottomRadius="none"
                w="100%"
                textAlign="left"
                fontWeight="400"
                justifyContent="space-between"
                onClick={() => send({ type: "EDIT_CONTENT" })}
              >
                Content
                <HStack>
                  {hasSettings && <ActiveIndicator />}
                  <LuChevronRight />
                </HStack>
              </Button>
              <Button
                colorPalette="action"
                variant="subtle"
                borderRadius="none"
                w="100%"
                textAlign="left"
                fontWeight="400"
                justifyContent="space-between"
                onClick={() => send({ type: "EDIT_CHAT" })}
              >
                Chat
                <HStack>
                  {hasChatSettings && <ActiveIndicator />}
                  <LuChevronRight />
                </HStack>
              </Button>
              <Button
                colorPalette="action"
                variant="subtle"
                borderRadius="none"
                w="100%"
                textAlign="left"
                fontWeight="400"
                justifyContent="space-between"
                onClick={() => send({ type: "EDIT_DJ" })}
              >
                DJ Features
                <HStack>
                  {hasDjSettings && <ActiveIndicator />}
                  <LuChevronRight />
                </HStack>
              </Button>
              <Button
                colorPalette="action"
                variant="subtle"
                borderRadius="lg"
                borderTopRadius="none"
                w="100%"
                textAlign="left"
                fontWeight="400"
                justifyContent="space-between"
                onClick={() => send({ type: "EDIT_PASSWORD" })}
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
                    colorPalette="action"
                    variant="subtle"
                    w="100%"
                    textAlign="left"
                    fontWeight="400"
                    justifyContent="space-between"
                    borderRadius={
                      index === 0 ? "lg" : index === configurablePlugins.length - 1 ? "lg" : "none"
                    }
                    borderTopRadius={index === 0 ? undefined : "none"}
                    borderBottomRadius={
                      index === configurablePlugins.length - 1 ? undefined : "none"
                    }
                    onClick={() => send({ type: toEventName(plugin.name) } as any)}
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

          <VStack align="left" gap={2}>
            <Heading as="h4" size="sm" textAlign="left">
              Presets
            </Heading>
            <Text fontSize="sm" color="gray.500">
              Export your plugin settings as a file, or import a preset to apply saved
              configurations.
            </Text>
            <HStack w="100%" gap={2}>
              <Button
                colorPalette="action"
                variant="subtle"
                borderRadius="lg"
                flex={1}
                onClick={handleExportPreset}
                disabled={!hasPluginConfigs}
              >
                <LuDownload />
                Export
              </Button>
              <Button
                colorPalette="action"
                variant="subtle"
                borderRadius="lg"
                flex={1}
                onClick={handleImportClick}
              >
                <LuUpload />
                Import
              </Button>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                display="none"
                onChange={handleFileChange}
              />
            </HStack>
          </VStack>

          <VStack w="100%" align="left" gap={2}>
            <Heading as="h4" size="sm" textAlign="left">
              Authentication
            </Heading>
            <VStack w="100%" align="left" gap={4}>
              <ButtonRoomAuthSpotify />
              <ButtonRoomAuthTidal />
            </VStack>
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
