import React, { useEffect, useRef } from "react"
import { Stack, StackDivider } from "@chakra-ui/react"
import { Virtuoso, VirtuosoHandle } from "react-virtuoso"
import { PlaylistItem } from "../types/PlaylistItem"
import SelectablePlaylistItem from "./SelectablePlaylistItem"

type Props = {
  playlist: PlaylistItem[]
  isSelectable: boolean
  selected?: PlaylistItem[]
  onSelect?: (item: PlaylistItem, isChecked: boolean) => void
}

const List = React.forwardRef(({ style, ...props }: { style: any }, ref) => {
  return (
    <Stack
      direction="column"
      divider={<StackDivider borderColor="secondaryBorder" />}
      style={{ ...style }}
      ref={ref}
      {...props}
    />
  )
})

const PlaylistWindow = ({
  playlist,
  isSelectable,
  selected,
  onSelect,
}: Props) => {
  const virtuosoRef = useRef<VirtuosoHandle>(null)

  const renderComponent = (index: number) => {
    return (
      <SelectablePlaylistItem
        item={playlist[index]}
        isSelectable={isSelectable}
        selected={selected}
        onSelect={onSelect}
      />
    )
  }

  return (
    <Virtuoso
      style={{ height: "100%" }}
      totalCount={playlist.length}
      itemContent={renderComponent}
      ref={virtuosoRef}
      components={{ List }}
      initialTopMostItemIndex={playlist.length - 1}
    />
  )
}

export default PlaylistWindow
