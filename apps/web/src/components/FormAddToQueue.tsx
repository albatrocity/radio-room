import { Stack, Text } from "@chakra-ui/react"
import TrackSearch from "./TrackSearch"
import { SingleValue } from "chakra-react-select"
import { MetadataSourceTrack } from "@repo/types"

type Props = {
  onAddToQueue: (track: MetadataSourceTrack) => void
  isDisabled?: boolean
  onDropdownOpenChange: (isOpen: boolean) => void
}

const FormAddToQueue = ({ onAddToQueue, isDisabled, onDropdownOpenChange }: Props) => {
  const handleSelect = (track: SingleValue<MetadataSourceTrack>) => {
    if (track) {
      onAddToQueue(track)
    }
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
        onDropdownOpenChange={onDropdownOpenChange}
        autoFocus
      />
    </Stack>
  )
}

export default FormAddToQueue
