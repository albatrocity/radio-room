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
          <Hide above="sm">
            <WrapItem>
              <IconButton
                aria-label="Back to Rooms"
                as={Link}
                variant="ghost"
                colorScheme={buttonColorScheme}
                icon={<ArrowBackIcon />}
                to="/"
              >
                Back to Rooms
              </IconButton>
            </WrapItem>
          </Hide>
        </Wrap>
        <Show above="sm">
          <Wrap>
            <WrapItem>
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
            </WrapItem>
          </Wrap>
        </Show>
      </Stack>
    </Box>
  )
}

export default AdminPanel
