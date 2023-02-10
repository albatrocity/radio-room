import React from "react"
import {
  Box,
  Icon,
  IconButton,
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverHeader,
  PopoverTrigger,
  Heading,
  VStack,
  HStack,
  Text,
  Spacer,
  Flex,
  Switch,
  FormControl,
  FormLabel,
  useColorMode,
} from "@chakra-ui/react"
import { FiSettings, FiMoon } from "react-icons/fi"

import FormTheme from "./FormTheme"

type Props = {}

const PopoverTheme = (props: Props) => {
  const { colorMode, toggleColorMode } = useColorMode()
  return (
    <Popover>
      <PopoverTrigger>
        <IconButton
          aria-label="Settings"
          variant="ghost"
          icon={<Icon as={FiSettings} />}
        />
      </PopoverTrigger>
      <PopoverContent>
        <PopoverHeader fontWeight="bold">Preferences</PopoverHeader>
        <PopoverArrow />
        <Box p={4}>
          <VStack align="start" spacing={2}>
            <HStack justify="space-between" spacing={1} w="100%">
              <Flex grow={1}>
                <Heading size="xs" as="h4" fontWeight="semibold">
                  Theme
                </Heading>
              </Flex>
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
            <FormTheme />
          </VStack>
        </Box>
      </PopoverContent>
    </Popover>
  )
}

export default PopoverTheme
