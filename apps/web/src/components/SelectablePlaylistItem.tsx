import { Checkbox, HStack } from "@chakra-ui/react"
import React, { memo, useCallback } from "react"
import { PlaylistItem as Item } from "../types/PlaylistItem"
import PlaylistItem from "./PlaylistItem"

interface Props {
  item: Item
  isSelectable?: boolean
  isSelected?: boolean
  onSelect?: (item: Item, isChecked: boolean) => void
}

const SelectablePlaylistItem = memo(function SelectablePlaylistItem({
  item,
  isSelectable = false,
  isSelected = false,
  onSelect,
}: Props) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSelect?.(item, e.target.checked)
    },
    [onSelect, item],
  )

  return (
    <HStack>
      {isSelectable && <Checkbox isChecked={isSelected} onChange={handleChange} />}
      <PlaylistItem item={item} />
    </HStack>
  )
})

export default SelectablePlaylistItem
