import { memo, useEffect } from "react"
import {
  Box,
  Icon,
  IconButton,
  Popover,
  VStack,
  HStack,
  Flex,
  Switch,
  Separator,
  Field,
  Text,
} from "@chakra-ui/react"
import { FiSettings, FiMoon, FiZapOff, FiZap } from "react-icons/fi"

import FormTheme from "./FormTheme"
import ButtonAuthSpotify from "./ButtonAuthSpotify"
import { ServiceSelect } from "./ServiceSelect"
import {
  useCurrentRoom,
  useAvailableMetadataSources,
  usePreferredMetadataSource,
  useMetadataPreferenceSend,
} from "../hooks/useActors"
import { useColorMode } from "./ui/color-mode"
import { setAvailableSources } from "../actors"
import { MetadataSourceType } from "../types/Queue"
import { useAnimationPreference } from "../hooks/useReducedMotion"

type Props = {}

const PopoverPreferences = (props: Props) => {
  const { colorMode, toggleColorMode } = useColorMode()
  const { animationsEnabled, toggleAnimations } = useAnimationPreference()
  const room = useCurrentRoom()
  const availableSources = useAvailableMetadataSources()
  const preferredSource = usePreferredMetadataSource()
  const sendMetadataPreference = useMetadataPreferenceSend()

  // Sync available sources from room config
  useEffect(() => {
    if (room?.metadataSourceIds && room.metadataSourceIds.length > 0) {
      setAvailableSources(room.metadataSourceIds as MetadataSourceType[])
    }
  }, [room?.metadataSourceIds])

  const handleSourceChange = (source: MetadataSourceType) => {
    sendMetadataPreference({
      type: "SET_PREFERRED_SOURCE",
      source,
    })
  }

  const showMetadataSourceSelect = availableSources.length > 1

  return (
    <Popover.Root lazyMount>
      <Popover.Trigger asChild>
        <IconButton aria-label="Settings" variant="ghost" colorPalette="action">
          <Icon as={FiSettings} />
        </IconButton>
      </Popover.Trigger>
      <Popover.Positioner>
        <Popover.Content css={{ "--popover-bg": "{colors.appBg}" }}>
          <Popover.Header fontWeight="bold">
            <HStack align="center">
              <Flex grow={1}>Theme</Flex>
              <HStack align="center">
                <Icon as={FiMoon} aria-label="Dark Mode" />
                <Switch.Root
                  id="darkMode"
                  onCheckedChange={toggleColorMode}
                  checked={colorMode === "dark"}
                >
                  <Switch.HiddenInput />
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Root>
              </HStack>
            </HStack>
          </Popover.Header>
          <Popover.Arrow />
          <Box p={4}>
            <VStack align="start" gap={2}>
              <FormTheme />
            </VStack>
          </Box>
          <Separator />
          <VStack align="stretch">
            <Box p={4}>
              {showMetadataSourceSelect && (
                <Field.Root>
                  <Field.Label>
                    <Text fontWeight="semibold">Preferred Music Service</Text>
                  </Field.Label>
                  <ServiceSelect
                    value={preferredSource || availableSources[0] || "spotify"}
                    onChange={handleSourceChange}
                    availableServices={availableSources}
                    size="md"
                  />
                  <Field.HelperText>Track info and links will use this service</Field.HelperText>
                </Field.Root>
              )}
            </Box>
            <Separator />
            <HStack p={4} align="center" justify="space-between" gap={2}>
              <Text fontWeight="semibold">Animations</Text>
              <HStack align="center">
                <Icon as={FiZap} aria-label="Animations" />
                <Switch.Root
                  id="animations"
                  onCheckedChange={toggleAnimations}
                  checked={animationsEnabled}
                >
                  <Switch.HiddenInput />
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Root>
              </HStack>
            </HStack>
            {room?.enableSpotifyLogin && (
              <>
                <Separator />
                <Box p={4}>
                  <ButtonAuthSpotify />
                </Box>
              </>
            )}
          </VStack>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  )
}

export default memo(PopoverPreferences)
