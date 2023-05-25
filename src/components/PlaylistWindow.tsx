import React, { useRef } from "react"
import { Divider, VStack } from "@chakra-ui/react"
import { Virtuoso, VirtuosoHandle } from "react-virtuoso"
import { PlaylistItem } from "../types/PlaylistItem"
import SelectablePlaylistItem from "./SelectablePlaylistItem"

type Props = {
  playlist: PlaylistItem[]
  isSelectable: boolean
  selected?: PlaylistItem[]
  onSelect?: (item: PlaylistItem, isChecked: boolean) => void
}

const PlaylistWindow = ({
  playlist,
  isSelectable,
  selected,
  onSelect,
}: Props) => {
  const virtuosoRef = useRef<VirtuosoHandle>(null)

  const renderComponent = (index: number) => {
    return (
      <VStack pb={2} spacing={2} w="100%" align="stretch">
        <SelectablePlaylistItem
          item={playlist[index]}
          isSelectable={isSelectable}
          selected={selected}
          onSelect={onSelect}
        />
        <Divider borderColor="secondaryBorder" w="100%" />
      </VStack>
    )
  }

  return (
    <Virtuoso
      style={{ height: "100%" }}
      totalCount={playlist.length}
      itemContent={renderComponent}
      ref={virtuosoRef}
      initialTopMostItemIndex={playlist.length - 1}
    />
  )
}

export default PlaylistWindow
