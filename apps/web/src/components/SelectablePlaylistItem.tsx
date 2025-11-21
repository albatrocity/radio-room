import { Checkbox, HStack } from "@chakra-ui/react"
import React from "react"
import { PlaylistItem as Item } from "../types/PlaylistItem"
import PlaylistItem from "./PlaylistItem"

type Props = {
  item: Item
  isSelectable?: boolean
  selected?: Item[]
  onSelect?: (item: Item, isChecked: boolean) => void
}

const SelectablePlaylistItem = ({ item, isSelectable = false, selected = [], onSelect }: Props) => {
  return (
    <HStack key={item.playedAt?.toString() || item.addedAt.toString()}>
      {isSelectable && (
        <Checkbox
          isChecked={selected.map((item) => item.track.id).includes(item.track.id)}
          onChange={onSelect ? (e) => onSelect(item, e.target.checked) : undefined}
        />
      )}
      <PlaylistItem item={item} />
    </HStack>
  )
}

export default SelectablePlaylistItem
