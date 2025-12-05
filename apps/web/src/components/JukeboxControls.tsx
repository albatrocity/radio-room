import { Box, HStack, IconButton, Icon } from "@chakra-ui/react"
import { RiPlayListFill } from "react-icons/ri"

import ButtonAddToLibrary from "./ButtonAddToLibrary"
import ButtonAddToQueue from "./ButtonAddToQueue"
import ButtonListeners from "./ButtonListeners"
import ReactionCounter from "./ReactionCounter"
import AdminControls from "./AdminControls"
import { useIsAdmin } from "../state/authStore"

type Props = {
  trackId: string // For reactions (stable ID)
  libraryTrackId: string // For library operations (MetadataSource ID)
  hasPlaylist: boolean
  onShowPlaylist: () => void
}

export default function JukeboxControls({
  trackId,
  libraryTrackId,
  hasPlaylist,
  onShowPlaylist,
}: Props) {
  const isAdmin = useIsAdmin()
  return (
    <Box>
      <Box background="actionBg">
        <Box py={1} h={10} overflowX="auto">
          <Box px={4} flexDir="row">
            <HStack alignItems="flex-start">
              <ButtonAddToLibrary id={libraryTrackId} />
              <ReactionCounter
                reactTo={{ type: "track", id: trackId }}
                showAddButton={true}
                darkBg={true}
                buttonColorScheme="action"
                buttonVariant="bright"
                scrollHorizontal
              />
            </HStack>
          </Box>
        </Box>
      </Box>
      <Box background="actionBgDark">
        <Box>
          <HStack px={2} justifyContent={hasPlaylist ? "space-between" : "flex-end"}>
            {hasPlaylist && (
              <IconButton
                size="md"
                aria-label="Playlist"
                colorPalette="action"
                variant="bright"
                onClick={onShowPlaylist}
              >
                <Icon boxSize={5} as={RiPlayListFill} />
              </IconButton>
            )}
            <Box hideFrom="sm">
              <HStack>
                {isAdmin && <AdminControls buttonColorScheme="action" />}
                <ButtonAddToQueue variant="bright" showText={!isAdmin} />
                <ButtonListeners variant="bright" />
              </HStack>
            </Box>
          </HStack>
        </Box>
      </Box>
    </Box>
  )
}
