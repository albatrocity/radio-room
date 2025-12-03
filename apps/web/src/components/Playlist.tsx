import React, { memo, useMemo } from "react"
import { Stack, Separator } from "@chakra-ui/react"
import { PlaylistItem as PlaylistItemType } from "../types/PlaylistItem"
import SelectablePlaylistItem from "./SelectablePlaylistItem"

interface PlaylistProps {
  data: PlaylistItemType[]
  isSelectable?: boolean
  selected?: PlaylistItemType[]
  onSelect?: (item: PlaylistItemType, isChecked: boolean) => void
}

const Playlist = memo(function Playlist({
  data = [],
  isSelectable,
  selected,
  onSelect,
}: PlaylistProps) {
  // Memoize selected IDs set for O(1) lookup instead of O(n) on each item
  const selectedIds = useMemo(
    () => new Set(selected?.map((item) => item.track.id)),
    [selected],
  )

  return (
    <Stack
      direction="column"
      separator={<Separator borderColor="secondaryBorder" />}
    >
      {data.map((item) => (
        <SelectablePlaylistItem
          key={item.track.id}
          item={item}
          isSelectable={isSelectable}
          isSelected={selectedIds.has(item.track.id)}
          onSelect={onSelect}
        />
      ))}
    </Stack>
  )
})

export default Playlist
