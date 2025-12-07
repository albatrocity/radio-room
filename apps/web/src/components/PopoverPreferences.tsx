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
  NativeSelect,
  Text,
} from "@chakra-ui/react"
import { FiSettings, FiMoon } from "react-icons/fi"

import FormTheme from "./FormTheme"
import ButtonAuthSpotify from "./ButtonAuthSpotify"
import {
  useCurrentRoom,
  useAvailableMetadataSources,
  usePreferredMetadataSource,
  useMetadataPreferenceSend,
} from "../hooks/useActors"
import { useColorMode } from "./ui/color-mode"
import { metadataSourceDisplayNames, setAvailableSources } from "../actors"
import { MetadataSourceType } from "../types/Queue"

type Props = {}

const PopoverPreferences = (props: Props) => {
  const { colorMode, toggleColorMode } = useColorMode()
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

  const handleSourceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    sendMetadataPreference({
      type: "SET_PREFERRED_SOURCE",
      source: e.target.value as MetadataSourceType,
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
            <HStack justify="space-between" gap={1} w="100%">
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
          {showMetadataSourceSelect && (
            <>
              <Separator />
              <Box p={4}>
                <Field.Root>
                  <Field.Label>
                    <Text fontWeight="semibold">Preferred Music Service</Text>
                  </Field.Label>
                  <NativeSelect.Root>
                    <NativeSelect.Field value={preferredSource} onChange={handleSourceChange}>
                      {availableSources.map((source) => (
                        <option key={source} value={source}>
                          {metadataSourceDisplayNames[source] ?? source}
                        </option>
                      ))}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                  <Field.HelperText>Track info and links will use this service</Field.HelperText>
                </Field.Root>
              </Box>
            </>
          )}
          {room?.enableSpotifyLogin && (
            <>
              <Separator />
              <Box p={4}>
                <ButtonAuthSpotify />
              </Box>
            </>
          )}
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  )
}

export default memo(PopoverPreferences)
