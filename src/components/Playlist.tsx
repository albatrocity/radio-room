import React from "react"
import { Checkbox, HStack, Stack, StackDivider } from "@chakra-ui/react"
import { PlaylistItem as PlaylistItemType } from "../types/PlaylistItem"
import PlaylistItem from "./PlaylistItem"

const Playlist = ({
  data = [],
  selectable,
  selected,
  onSelect,
}: {
  data: PlaylistItemType[]
  selectable?: boolean
  selected?: PlaylistItemType[]
  onSelect?: (item: PlaylistItemType, isChecked: boolean) => void
}) => {
  return (
    <Stack
      direction="column"
      divider={<StackDivider borderColor="secondaryBorder" />}
    >
      {data.map((item) => (
        <HStack key={item.timestamp.toString()}>
          {selectable && (
            <Checkbox
              isChecked={selected
                ?.map(({ spotifyData }) => spotifyData?.uri)
                .includes(item.spotifyData?.uri)}
              onChange={
                onSelect ? (e) => onSelect(item, e.target.checked) : undefined
              }
            />
          )}
          <PlaylistItem item={item} />
        </HStack>
      ))}
    </Stack>
  )
}

export default Playlist
