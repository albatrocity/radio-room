import React from "react"
import { Box, Text } from "@chakra-ui/react"
import SpotifySearch from "./SpotifySearch"
import { SingleValue } from "chakra-react-select"
import { SpotifyTrack } from "../types/SpotifyTrack"

type Props = {
  onAddToQueue: (track: SpotifyTrack) => void
  isDisabled?: boolean
  onDropdownOpenChange: (isOpen: boolean) => void
}

const FormAddToQueue = ({
  onAddToQueue,
  isDisabled,
  onDropdownOpenChange,
}: Props) => {
  const handleSelect = (track: SingleValue<SpotifyTrack>) => {
    if (track) {
      onAddToQueue(track)
    }
  }

  return (
    <Box textStyle="body">
      <Text as="p" fontSize="sm">
        Selecting a song will send it to the DJ's play queue, where they can
        choose to leave it in, reorder it, or remove it completely.
      </Text>
      <SpotifySearch
        onChoose={handleSelect}
        placeholder="Search for a track on Spotify"
        isDisabled={isDisabled}
        onDropdownOpenChange={onDropdownOpenChange}
        autoFocus
      />
    </Box>
  )
}

export default FormAddToQueue
