import React, { memo } from "react"
import {
  Box,
  Icon,
  IconButton,
  PopoverRoot,
  PopoverContent,
  PopoverHeader,
  PopoverTrigger,
  PopoverArrow,
  VStack,
  HStack,
  Flex,
  Switch,
  Separator,
} from "@chakra-ui/react"
import { FiSettings, FiMoon } from "react-icons/fi"

import FormTheme from "./FormTheme"
import ButtonAuthSpotify from "./ButtonAuthSpotify"
import { useCurrentRoom } from "../state/roomStore"
import { useColorMode } from "./ui/color-mode"

type Props = {}

const PopoverPreferences = (props: Props) => {
  const { colorMode, toggleColorMode } = useColorMode()
  const room = useCurrentRoom()
  return (
    <PopoverRoot lazyMount>
      <PopoverTrigger asChild>
        <IconButton
          aria-label="Settings"
          variant="ghost"
        >
          <Icon as={FiSettings} />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent>
        <PopoverHeader fontWeight="bold">
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
        </PopoverHeader>
        <PopoverArrow />
        <Box p={4}>
          <VStack align="start" gap={2}>
            <FormTheme />
          </VStack>
        </Box>
        {room?.enableSpotifyLogin && (
          <>
            <Separator />
            <Box p={4}>
              <ButtonAuthSpotify />
            </Box>
          </>
        )}
      </PopoverContent>
    </PopoverRoot>
  )
}

export default memo(PopoverPreferences)
