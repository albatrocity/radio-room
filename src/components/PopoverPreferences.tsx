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
  Text,
  useColorMode,
} from "@chakra-ui/react"
import { FiSettings } from "react-icons/fi"

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
        <VStack p={4} align="start" spacing={2}>
          <Box>
            <Heading size="xs" as="h4" fontWeight="semibold">
              Theme
            </Heading>
            <Text fontSize="xs">Each theme has a dark version</Text>
          </Box>
          <FormTheme />
        </VStack>
      </PopoverContent>
    </Popover>
  )
}

export default PopoverTheme
