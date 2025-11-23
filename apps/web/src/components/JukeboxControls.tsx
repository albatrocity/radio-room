import React from "react"
import { Box, Hide, HStack, IconButton, Icon } from "@chakra-ui/react"
import { RiPlayListFill } from "react-icons/ri"

import ButtonAddToLibrary from "./ButtonAddToLibrary"
import ButtonAddToQueue from "./ButtonAddToQueue"
import ButtonListeners from "./ButtonListeners"
import ReactionCounter from "./ReactionCounter"
import AdminControls from "./AdminControls"
import { useIsAdmin } from "../state/authStore"
import { RoomMeta } from "../types/Room"

type Props = {
  trackId: string
  meta?: RoomMeta
  hasPlaylist: boolean
  onShowPlaylist: () => void
}

export default function JukeboxControls({ trackId, meta, hasPlaylist, onShowPlaylist }: Props) {
  const isAdmin = useIsAdmin()
  return (
    <Box>
      <Box background="actionBg">
        <Box py={1} h={10} overflowX="auto">
          <Box px={4} flexDir="row">
            <HStack alignItems="flex-start">
              <ButtonAddToLibrary 
                id={meta?.nowPlaying?.metadataSource?.trackId || meta?.release?.track?.id}
                metadataSourceType={meta?.nowPlaying?.metadataSource?.type}
              />
              <ReactionCounter
                reactTo={{ type: "track", id: trackId }}
                showAddButton={true}
                darkBg={true}
                scrollHorizontal
              />
            </HStack>
          </Box>
        </Box>
      </Box>
      <Box background="actionBgLite">
        <Box>
          <HStack px={2} justifyContent={hasPlaylist ? "space-between" : "flex-end"}>
            {hasPlaylist && (
              <IconButton
                size="md"
                aria-label="Playlist"
                variant="ghost"
                onClick={onShowPlaylist}
                icon={<Icon boxSize={5} as={RiPlayListFill} />}
              />
            )}
            <Hide above="sm">
              <HStack>
                {isAdmin && <AdminControls />}
                <ButtonAddToQueue showText={!isAdmin} />
                <ButtonListeners variant="ghost" />
              </HStack>
            </Hide>
          </HStack>
        </Box>
      </Box>
    </Box>
  )
}
