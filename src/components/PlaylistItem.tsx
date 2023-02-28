import React, { useMemo } from "react"
import { format } from "date-fns"
import { Stack, LinkBox, LinkOverlay, Text, Image, Box } from "@chakra-ui/react"

import { PlaylistItem as PlaylistItemType } from "../types/PlaylistItem"

type Props = {
  item: PlaylistItemType
}

function PlaylistItem({ item }: Props) {
  const artThumb = useMemo(
    () =>
      (item.spotifyData?.artworkImages || []).find(({ width }) => width < 200)
        ?.url,
    [item.spotifyData],
  )
  return (
    <Stack
      key={item.timestamp.toString()}
      direction={["column", "row"]}
      justifyContent="space-between"
      align="stretch"
      width="100%"
    >
      <LinkBox>
        <Stack direction="row">
          {artThumb && (
            <Box maxW={12} maxH={12}>
              <Image src={artThumb} />
            </Box>
          )}
          <Stack direction="column" spacing={0}>
            {(item.track || item.album) && (
              <LinkOverlay isExternal href={item.spotifyData?.url} m={0}>
                <Text fontWeight={"bold"}>{item.track}</Text>
              </LinkOverlay>
            )}
            {item.artist && <Text>{item.artist}</Text>}
          </Stack>
        </Stack>
      </LinkBox>
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
}

export default PlaylistItem
