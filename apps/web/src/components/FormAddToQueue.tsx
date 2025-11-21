import React from "react"
import { Box, Text } from "@chakra-ui/react"
import TrackSearch from "./TrackSearch"
import { SingleValue } from "chakra-react-select"
import { MetadataSourceTrack } from "@repo/types"

type Props = {
  onAddToQueue: (track: MetadataSourceTrack) => void
  isDisabled?: boolean
  onDropdownOpenChange: (isOpen: boolean) => void
}

const FormAddToQueue = ({
  onAddToQueue,
  isDisabled,
  onDropdownOpenChange,
}: Props) => {
  const handleSelect = (track: SingleValue<MetadataSourceTrack>) => {
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
      <TrackSearch
        onChoose={handleSelect}
        placeholder="Search for a track"
        isDisabled={isDisabled}
        onDropdownOpenChange={onDropdownOpenChange}
        autoFocus
      />
    </Box>
  )
}

export default FormAddToQueue
