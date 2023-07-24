import React from "react"

import {
  Stack,
  Button,
  Heading,
  Icon,
  IconButton,
  Box,
  Wrap,
  WrapItem,
  Show,
  Hide,
  BoxProps,
} from "@chakra-ui/react"
import { ArrowBackIcon } from "@chakra-ui/icons"

import { FiSettings, FiBookmark } from "react-icons/fi"

import { useBookmarks } from "../state/bookmarkedChatStore"
import { useModalsStore } from "../state/modalsState"
import { Link } from "gatsby"

type Props = {
  buttonColorScheme?: string
} & BoxProps

function AdminPanel({ buttonColorScheme, width, ...rest }: Props) {
  const { send: modalSend } = useModalsStore()

  const bookmarks = useBookmarks()

  return (
    <Box w={width}>
      <Stack direction="column" {...rest}>
        <Show above="sm">
          <Heading
            as="h3"
            size="md"
            color="whiteAlpha.700"
            margin={{ bottom: "xsmall" }}
          >
            Admin
          </Heading>
        </Show>

        <Wrap>
          <WrapItem>
            <Show above="sm">
              <Button
                size="xs"
                variant="ghost"
                colorScheme={buttonColorScheme}
                leftIcon={<Icon as={FiSettings} />}
                onClick={() => modalSend("EDIT_SETTINGS")}
              >
                Settings
              </Button>
            </Show>
            <Hide above="sm">
              <IconButton
                size="md"
                variant="ghost"
                colorScheme={buttonColorScheme}
                icon={<Icon as={FiSettings} />}
                onClick={() => modalSend("EDIT_SETTINGS")}
                aria-label="Settings"
              />
            </Hide>
          </WrapItem>
          <WrapItem>
            <Show above="sm">
              <Button
                size="xs"
                variant="ghost"
                colorScheme={buttonColorScheme}
                leftIcon={<Icon as={FiBookmark} />}
                onClick={() => modalSend("VIEW_BOOKMARKS")}
              >
                Bookmarks {bookmarks.length > 0 ? `(${bookmarks.length})` : ""}
              </Button>
            </Show>
            <Hide above="sm">
              <IconButton
                size="md"
                variant="ghost"
                colorScheme={buttonColorScheme}
                icon={<Icon as={FiBookmark} />}
                aria-label="Bookmarks"
                onClick={() => modalSend("VIEW_BOOKMARKS")}
              />
            </Hide>
          </WrapItem>
        </Wrap>
        <Wrap>
          <WrapItem>
            <Show above="sm">
              <Button
                as={Link}
                size="xs"
                variant="ghost"
                colorScheme={buttonColorScheme}
                leftIcon={<ArrowBackIcon />}
                to="/"
              >
                Back to Rooms
              </Button>
            </Show>
            <Hide above="sm">
              <IconButton
                as={Link}
                size="xs"
                variant="ghost"
                colorScheme={buttonColorScheme}
                icon={<ArrowBackIcon />}
                aria-label="Back to Rooms"
                to="/"
              >
                Back to Rooms
              </IconButton>
            </Hide>
          </WrapItem>
        </Wrap>
      </Stack>
    </Box>
  )
}

export default AdminPanel
