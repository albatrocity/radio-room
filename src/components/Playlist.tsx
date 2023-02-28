import React from "react"
import { Stack, StackDivider } from "@chakra-ui/react"
import { PlaylistItem as PlaylistItemType } from "../types/PlaylistItem"
import PlaylistItem from "./PlaylistItem"

const Playlist = ({ data = [] }: { data: PlaylistItemType[] }) => {
  return (
    <Stack direction="column" divider={<StackDivider borderColor="gray.200" />}>
      {data.map((item) => (
        <PlaylistItem key={item.timestamp.toString()} item={item} />
      ))}
    </Stack>
  )
}

export default Playlist
