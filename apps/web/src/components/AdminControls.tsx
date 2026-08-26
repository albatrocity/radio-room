import {
  Stack,
  Button,
  Heading,
  Icon,
  IconButton,
  Box,
  Wrap,
  BoxProps,
  RecipeProps,
} from "@chakra-ui/react"
import { LuSettings, LuBookmark } from "react-icons/lu"

import { useBookmarks, useModalsSend } from "../hooks/useActors"
import { useIntegratedPanelToggle } from "../hooks/useIntegratedPanelPresentation"
import QuickAccessMenu from "./QuickAccessMenu"

type ButtonVariant = RecipeProps<"button">["variant"]

type Props = {
  buttonColorScheme?: string
  buttonVariant?: ButtonVariant
} & BoxProps

function AdminPanel({ buttonColorScheme, buttonVariant = "bright", width, ...rest }: Props) {
  const modalSend = useModalsSend()
  const bookmarks = useBookmarks()
  const { isActive: isSettingsActive, toggle: toggleSettings } =
    useIntegratedPanelToggle("adminSettings")
  const settingsVariant = isSettingsActive ? "solid" : buttonVariant

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
              variant={settingsVariant}
              colorPalette={buttonColorScheme}
              aria-pressed={isSettingsActive}
              aria-label={isSettingsActive ? "Close settings" : "Settings"}
              onClick={toggleSettings}
            >
              <Icon as={LuSettings} />
              Settings
            </Button>
          </Box>
          <Box hideFrom="sm">
            <IconButton
              size="md"
              variant={settingsVariant}
              colorPalette={buttonColorScheme}
              aria-pressed={isSettingsActive}
              aria-label={isSettingsActive ? "Close settings" : "Settings"}
              onClick={toggleSettings}
            >
              <Icon as={LuSettings} />
            </IconButton>
          </Box>

          <QuickAccessMenu buttonColorScheme={buttonColorScheme} buttonVariant={buttonVariant} />
          <Box hideBelow="sm">
            <Button
              size="xs"
              variant={buttonVariant}
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
              variant={buttonVariant}
              colorPalette={buttonColorScheme}
              aria-label="Bookmarks"
              onClick={() => modalSend({ type: "VIEW_BOOKMARKS" })}
            >
              <Icon as={LuBookmark} />
            </IconButton>
          </Box>
        </Wrap>
      </Stack>
    </Box>
  )
}

export default AdminPanel
