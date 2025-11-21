import React, { useMemo } from "react"
import { format } from "date-fns"
import { Stack, LinkBox, LinkOverlay, Text, Icon, Image, Box } from "@chakra-ui/react"

import { PlaylistItem as PlaylistItemType } from "../types/PlaylistItem"
import { FiUser } from "react-icons/fi"
import { useUsersStore } from "../state/usersStore"

type Props = {
  item: PlaylistItemType
}

function PlaylistItem({ item }: Props) {
  // Get album art from track images (QueueItem format)
  const artThumb = useMemo(() => {
    const imageUrl = item.track.album?.images?.find(
      (img) => img.type === "image" && img.url,
    )?.url
    return imageUrl
  }, [item.track.album?.images])

  const djUsername = useUsersStore(
    (s) =>
      s.state.context.users.find((x) => x.userId === item.addedBy?.userId)?.username ??
      item.addedBy?.username,
  )

  // Get external URL from track.urls
  const externalUrl = useMemo(
    () => item.track.urls?.find((url) => url.type === "resource")?.url,
    [item.track.urls],
  )

  return (
    <Stack
      key={item.playedAt?.toString() || item.addedAt.toString()}
      direction={["column", "row"]}
      justifyContent="space-between"
      align="stretch"
      width="100%"
    >
      <LinkBox>
        <Stack direction="row">
          {artThumb && (
            <Box w={12} h={12}>
              <Image loading="lazy" src={artThumb} />
            </Box>
          )}
          <Stack direction="column" spacing={0}>
            {item.track && (
              <LinkOverlay isExternal href={externalUrl} m={0}>
                <Text fontWeight={"bold"}>{item.track.title}</Text>
              </LinkOverlay>
            )}
            {item.track.artists.map((a) => (
              <Text key={a.id}>{a.title}</Text>
            ))}
          </Stack>
        </Stack>
      </LinkBox>
      <Stack
        direction={["row", "column"]}
        justifyContent={["space-between", "space-around"]}
        align="end"
      >
        <Text color="secondaryText" fontSize="xs" textAlign="right">
          {item.playedAt ? format(item.playedAt, "p") : format(item.addedAt, "p")}
        </Text>
        {!!item.addedBy && (
          <Stack direction="row" spacing={2} justifyContent="center" alignItems="center">
            <Icon boxSize={3} color="secondaryText" as={FiUser} />
            <Text as="i" fontSize="xs" color="secondaryText">
              Added by {djUsername}
            </Text>
          </Stack>
        )}
      </Stack>
    </Stack>
  )
}

export default PlaylistItem
