import React from "react"
import { Stack, StackDivider } from "@chakra-ui/react"
import { PlaylistItem as PlaylistItemType } from "../types/PlaylistItem"
import SelectablePlaylistItem from "./SelectablePlaylistItem"

const Playlist = ({
  data = [],
  isSelectable,
  selected,
  onSelect,
}: {
  data: PlaylistItemType[]
  isSelectable?: boolean
  selected?: PlaylistItemType[]
  onSelect?: (item: PlaylistItemType, isChecked: boolean) => void
}) => {
  return (
    <Stack
      direction="column"
      divider={<StackDivider borderColor="secondaryBorder" />}
    >
      {data.map((item) => (
        <SelectablePlaylistItem
          item={item}
          isSelectable={isSelectable}
          selected={selected}
          onSelect={onSelect}
        />
      ))}
    </Stack>
  )
}

export default Playlist
