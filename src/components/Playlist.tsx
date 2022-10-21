import React, { useContext } from "react"
import { Text, Stack, StackDivider } from "@chakra-ui/react"
import { format } from "date-fns"
import { User } from "../types/User"

interface PlaylistItem {
  track: string
  album: string
  timestamp: number | Date
  artist: string
  dj: User
}

const Playlist = ({ data = [] }: { data: PlaylistItem[] }) => {
  return (
    <Stack direction="column" divider={<StackDivider borderColor="gray.200" />}>
      {data.map((item) => {
        return (
          <Stack
            key={item.timestamp.toString()}
            direction={["column", "row"]}
            justifyContent="space-between"
            align="stretch"
            width="100%"
          >
            <Stack direction="column">
              {(item.track || item.album) && (
                <Text fontWeight={"bold"}>{item.track}</Text>
              )}
              {item.artist && <Text>{item.artist}</Text>}
            </Stack>
            <Stack
              direction={["row", "column"]}
              justifyContent={["space-between", "space-around"]}
            >
              <Text color="blackAlpha.500" fontSize="xs">
                {format(item.timestamp, "p")}
              </Text>
              {item.dj && (
                <Text color="blackAlpha.500" fontSize="xs">
                  {" "}
                  {item.dj.username}
                </Text>
              )}
            </Stack>
          </Stack>
        )
      })}
    </Stack>
  )
}

export default Playlist
