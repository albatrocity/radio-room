import { Stack, Button, Heading, Icon, IconButton, Box, Wrap, BoxProps } from "@chakra-ui/react"
import { LuArrowLeft, LuSettings, LuBookmark } from "react-icons/lu"
import { Link } from "@tanstack/react-router"

import { useBookmarks, useModalsSend } from "../hooks/useActors"

type Props = {
  buttonColorScheme?: string
} & BoxProps

function AdminPanel({ buttonColorScheme, width, ...rest }: Props) {
  const modalSend = useModalsSend()
  const bookmarks = useBookmarks()

  return (
    <Box w={width}>
      <Stack direction="column" {...rest}>
        <Box hideBelow="sm">
          <Heading as="h3" size="md" color="whiteAlpha.700" mb={2}>
            Admin
          </Heading>
        </Box>

        <Wrap>
          <Box hideBelow="sm">
            <Button
              size="xs"
              variant="bright"
              colorPalette={buttonColorScheme}
              onClick={() => modalSend({ type: "EDIT_SETTINGS" })}
            >
              <Icon as={LuSettings} />
              Settings
            </Button>
          </Box>
          <Box hideFrom="sm">
            <IconButton
              size="md"
              variant="bright"
              colorPalette={buttonColorScheme}
              onClick={() => modalSend({ type: "EDIT_SETTINGS" })}
              aria-label="Settings"
            >
              <Icon as={LuSettings} />
            </IconButton>
          </Box>
          <Box hideBelow="sm">
            <Button
              size="xs"
              variant="bright"
              colorPalette={buttonColorScheme}
              onClick={() => modalSend({ type: "VIEW_BOOKMARKS" })}
            >
              <Icon as={LuBookmark} />
              Bookmarks {bookmarks.length > 0 ? `(${bookmarks.length})` : ""}
            </Button>
          </Box>
          <Box hideFrom="sm">
            <IconButton
              size="md"
              variant="bright"
              colorPalette={buttonColorScheme}
              aria-label="Bookmarks"
              onClick={() => modalSend({ type: "VIEW_BOOKMARKS" })}
            >
              <Icon as={LuBookmark} />
            </IconButton>
          </Box>
          <Box hideFrom="sm">
            <IconButton
              aria-label="Back to Rooms"
              asChild
              variant="bright"
              colorPalette={buttonColorScheme}
            >
              <Link to="/">
                <LuArrowLeft />
              </Link>
            </IconButton>
          </Box>
        </Wrap>
        <Box hideBelow="sm">
          <Wrap>
            <Button asChild size="xs" variant="bright" colorPalette={buttonColorScheme}>
              <Link to="/">
                <LuArrowLeft />
                Back to Rooms
              </Link>
            </Button>
          </Wrap>
        </Box>
      </Stack>
    </Box>
  )
}

export default AdminPanel
