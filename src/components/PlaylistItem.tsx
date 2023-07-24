import React, { useMemo } from "react"
import { format } from "date-fns"
import {
  Stack,
  LinkBox,
  LinkOverlay,
  Text,
  Icon,
  Image,
  Box,
} from "@chakra-ui/react"

import { PlaylistItem as PlaylistItemType } from "../types/PlaylistItem"
import { FiUser } from "react-icons/fi"
import { useUsersStore } from "../state/usersStore"

type Props = {
  item: PlaylistItemType
}

function PlaylistItem({ item }: Props) {
  const artThumb = useMemo(
    () =>
      (item.spotifyData?.album?.images || []).find(({ width }) => width < 200)
        ?.url,
    [item.spotifyData],
  )
  const djUsername = useUsersStore(
    (s) =>
      s.state.context.users.find((x) => x.userId === item.dj?.userId)
        ?.username ?? item.dj?.username,
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
            <Box w={12} h={12}>
              <Image loading="lazy" src={artThumb} />
            </Box>
          )}
          <Stack direction="column" spacing={0}>
            {(item.track || item.album) && (
              <LinkOverlay
                isExternal
                href={item.spotifyData?.external_urls?.spotify}
                m={0}
              >
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
        align="end"
      >
        <Text color="secondaryText" fontSize="xs" textAlign="right">
          {format(item.timestamp, "p")}
        </Text>
        {item.dj && (
          <Stack
            direction="row"
            spacing={2}
            justifyContent="center"
            alignItems="center"
          >
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
