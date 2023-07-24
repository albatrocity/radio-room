import React, { memo } from "react"
import {
  Box,
  Icon,
  IconButton,
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverHeader,
  PopoverTrigger,
  VStack,
  HStack,
  Flex,
  Switch,
  FormControl,
  FormLabel,
  useColorMode,
  Divider,
} from "@chakra-ui/react"
import { FiSettings, FiMoon } from "react-icons/fi"

import FormTheme from "./FormTheme"
import ButtonAuthSpotify from "./ButtonAuthSpotify"
import { useCurrentRoom } from "../state/roomStore"

type Props = {}

const PopoverPreferences = (props: Props) => {
  const { colorMode, toggleColorMode } = useColorMode()
  const room = useCurrentRoom()
  return (
    <Popover isLazy>
      <PopoverTrigger>
        <IconButton
          aria-label="Settings"
          variant="ghost"
          icon={<Icon as={FiSettings} />}
        />
      </PopoverTrigger>
      <PopoverContent>
        <PopoverHeader fontWeight="bold">
          <HStack justify="space-between" spacing={1} w="100%">
            <Flex grow={1}>Theme</Flex>
            <FormControl as={HStack} align="center" w="auto">
              <FormLabel htmlFor="darkMode" m={0}>
                <Icon as={FiMoon} aria-label="Dark Mode" />
              </FormLabel>
              <Switch
                id="darkMode"
                onChange={toggleColorMode}
                isChecked={colorMode === "dark"}
              />
            </FormControl>
          </HStack>
        </PopoverHeader>
        <PopoverArrow />
        <Box p={4}>
          <VStack align="start" spacing={2}>
            <FormTheme />
          </VStack>
        </Box>
        {room?.enableSpotifyLogin && (
          <>
            <Divider />
            <Box p={4}>
              <ButtonAuthSpotify />
            </Box>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

export default memo(PopoverPreferences)
