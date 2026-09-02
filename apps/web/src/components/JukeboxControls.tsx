import { Box, HStack } from "@chakra-ui/react"

import ButtonAddToLibrary from "./ButtonAddToLibrary"
import ButtonAddToQueue from "./ButtonAddToQueue"
import ButtonPlaylist from "./ButtonPlaylist"
import ButtonPolls from "./ButtonPolls"
import ButtonListeners from "./ButtonListeners"
import ReactionCounter from "./ReactionCounter"
import AdminControls from "./AdminControls"
import { useIsAdmin } from "../hooks/useActors"

type Props = {
  trackId: string // For reactions (stable ID)
  hasPlaylist: boolean
  onShowPlaylist: () => void
}

export default function JukeboxControls({ trackId, hasPlaylist, onShowPlaylist }: Props) {
  const isAdmin = useIsAdmin()
  return (
    <Box>
      <Box background="actionBg" layerStyle="themeTransition">
        <Box py={1} h={10} overflowX="auto">
          <Box px={4} flexDir="row">
            <HStack alignItems="flex-start">
              <ButtonAddToLibrary />
              <ReactionCounter
                reactTo={{ type: "track", id: trackId }}
                showAddButton={true}
                darkBg={true}
                buttonColorScheme="action"
                scrollHorizontal
              />
            </HStack>
          </Box>
        </Box>
      </Box>
      <Box background="actionBgDark" layerStyle="themeTransition">
        <Box>
          <HStack px={2} justifyContent={hasPlaylist ? "space-between" : "flex-end"}>
            {hasPlaylist && (
              <ButtonPlaylist variant="bright" colorPalette="action" onClick={onShowPlaylist} />
            )}
            <Box hideFrom="sm">
              <HStack>
                {isAdmin && <AdminControls buttonColorScheme="action" />}
                <ButtonPolls showText={false} variant="bright" />
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
