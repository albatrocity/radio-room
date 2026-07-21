import { Stack, Text } from "@chakra-ui/react"
import TrackSearch from "./TrackSearch"
import { MetadataSourceTrack } from "@repo/types"

type Props = {
  onAddToQueue: (track: MetadataSourceTrack) => void
  isDisabled?: boolean
  onSearchActiveChange?: (isActive: boolean) => void
}

const FormAddToQueue = ({ onAddToQueue, isDisabled, onSearchActiveChange }: Props) => {
  const handleSelect = (track: MetadataSourceTrack) => {
    onAddToQueue(track)
  }

  return (
    <Stack direction="column" gap={2} textStyle="body">
      <Text as="p" fontSize="sm">
        Selecting a song will send it to the room creator's play queue, where they can choose to
        leave it in, reorder it, or remove it completely.
      </Text>
      <TrackSearch
        onChoose={handleSelect}
        placeholder="Search for a track"
        disabled={isDisabled}
        onSearchActiveChange={onSearchActiveChange}
        autoFocus
      />
    </Stack>
  )
}

export default FormAddToQueue
