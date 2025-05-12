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

const SelectablePlaylistItem = ({
  item,
  isSelectable = false,
  selected = [],
  onSelect,
}: Props) => {
  return (
    <HStack key={item.timestamp?.toString()}>
      {isSelectable && (
        <Checkbox
          isChecked={selected
            .map(({ spotifyData }) => spotifyData?.uri)
            .includes(item.spotifyData?.uri)}
          onChange={
            onSelect ? (e) => onSelect(item, e.target.checked) : undefined
          }
        />
      )}
      <PlaylistItem item={item} />
    </HStack>
  )
}

export default SelectablePlaylistItem
