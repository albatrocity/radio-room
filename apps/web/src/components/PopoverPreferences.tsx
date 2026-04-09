import { memo, useEffect } from "react"
import {
  Badge,
  Box,
  Button,
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
  ScrollArea,
} from "@chakra-ui/react"
import { FiSettings, FiMoon, FiZap } from "react-icons/fi"

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
import { useHybridListeningTransport } from "../hooks/useHybridListeningTransport"

type Props = {}

const PopoverPreferences = (props: Props) => {
  const { colorMode, toggleColorMode } = useColorMode()
  const { animationsEnabled, toggleAnimations } = useAnimationPreference()
  const room = useCurrentRoom()
  const availableSources = useAvailableMetadataSources()
  const preferredSource = usePreferredMetadataSource()
  const sendMetadataPreference = useMetadataPreferenceSend()
  const { listeningTransport, persistTransport, isHybrid, hybridReady } =
    useHybridListeningTransport()

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
          <ScrollArea.Root maxH="70dvh" size="sm" variant="hover">
            <ScrollArea.Viewport>
              <ScrollArea.Content>
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
                        <Field.HelperText>
                          Track info and links will use this service
                        </Field.HelperText>
                      </Field.Root>
                    )}
                  </Box>
                  <Separator />
                  {isHybrid && hybridReady && (
                    <Box p={4}>
                      <Field.Root>
                        <Field.Label>
                          <Text fontWeight="semibold">Audio source</Text>
                        </Field.Label>
                        <HStack gap={2} flexWrap="wrap">
                          <Button
                            size="sm"
                            variant={listeningTransport === "shoutcast" ? "solid" : "outline"}
                            onClick={() => persistTransport("shoutcast")}
                          >
                            Shoutcast
                          </Button>
                          <Button
                            size="sm"
                            variant={listeningTransport === "webrtc" ? "solid" : "outline"}
                            onClick={() => persistTransport("webrtc")}
                          >
                            WebRTC
                            <Badge ml={2} size="sm" colorPalette="orange">
                              Experimental
                            </Badge>
                          </Button>
                        </HStack>
                        {listeningTransport === "webrtc" && (
                          <Field.HelperText mt={2}>
                            Lower latency than Shoutcast. Now Playing and artwork follow the
                            Shoutcast feed and may not match what you hear. Metadata can lag behind
                            audio on this path.
                          </Field.HelperText>
                        )}
                      </Field.Root>
                    </Box>
                  )}
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
              </ScrollArea.Content>
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar>
              <ScrollArea.Thumb />
            </ScrollArea.Scrollbar>
            <ScrollArea.Corner />
          </ScrollArea.Root>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  )
}

export default memo(PopoverPreferences)
