import React, { useRef } from "react"
import { Separator, VStack } from "@chakra-ui/react"
import { Virtuoso, VirtuosoHandle } from "react-virtuoso"
import { MetadataSourceType } from "@repo/types"
import { PlaylistItem } from "../types/PlaylistItem"
import SelectablePlaylistItem from "./SelectablePlaylistItem"

type Props = {
  playlist: PlaylistItem[]
  isSelectable: boolean
  selected?: PlaylistItem[]
  onSelect?: (item: PlaylistItem, isChecked: boolean) => void
  targetService?: MetadataSourceType
}

const PlaylistWindow = ({ playlist, isSelectable, selected, onSelect, targetService }: Props) => {
  const virtuosoRef = useRef<VirtuosoHandle>(null)

  const renderComponent = (index: number) => {
    const item = playlist[index]
    const isSelected = selected?.some((s) => s.track.id === item.track.id) ?? false
    
    return (
      <VStack pb={2} gap={2} w="100%" align="stretch">
        <SelectablePlaylistItem
          item={item}
          isSelectable={isSelectable}
          isSelected={isSelected}
          onSelect={onSelect}
          targetService={targetService}
        />
        <Separator borderColor="secondaryBorder" w="100%" />
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
