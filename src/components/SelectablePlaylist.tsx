import React from "react"

import { PlaylistItem } from "../types/PlaylistItem"
import Playlist from "./Playlist"

type Props = {
  isSelectable: boolean
  onToggle: (collection: PlaylistItem) => void
  playlistItems: PlaylistItem[]
  selected: PlaylistItem[]
}

function SelectablePlaylist({
  isSelectable,
  onToggle,
  playlistItems,
  selected,
}: Props) {
  const handleSelectItem = (item: PlaylistItem) => {
    onToggle(item)
  }

  return (
    <Playlist
      data={playlistItems}
      onSelect={handleSelectItem}
      selectable={isSelectable}
      selected={selected}
    />
  )
}

export default SelectablePlaylist
