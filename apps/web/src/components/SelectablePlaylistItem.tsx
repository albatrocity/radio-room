import { Checkbox as ChakraCheckbox, HStack } from "@chakra-ui/react"
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
    (details: { checked: boolean }) => {
      onSelect?.(item, details.checked)
    },
    [onSelect, item],
  )

  return (
    <HStack>
      {isSelectable && (
        <ChakraCheckbox.Root checked={isSelected} onCheckedChange={handleChange}>
          <ChakraCheckbox.HiddenInput />
          <ChakraCheckbox.Control />
        </ChakraCheckbox.Root>
      )}
      <PlaylistItem item={item} />
    </HStack>
  )
})

export default SelectablePlaylistItem
