import { useMemo, memo } from "react"
import {
  Stack,
  Text,
  Image,
  Box,
  HStack,
  StackSeparator,
  LinkBox,
  LinkOverlay,
} from "@chakra-ui/react"
import { LuMusic } from "react-icons/lu"
import { QueueItem } from "@repo/types"
import { getPreferredTrack } from "../types/PlaylistItem"
import { usePreferredMetadataSource } from "../hooks/useActors"

type Props = {
  item: QueueItem
  /** Size of the album art (default: 40px) */
  size?: "sm" | "md"
}

/**
 * TrackDisplay - A simplified track display component
 *
 * Shows album art, track title, and artists. Used in contexts where
 * we just need to display track info without the full PlaylistItem features
 * (added by, timestamps, plugin data, etc.)
 */
const TrackDisplay = memo(function TrackDisplay({ item, size = "sm" }: Props) {
  const preferredSource = usePreferredMetadataSource()

  // Get track data from preferred metadata source (or fall back to default)
  const preferredTrack = useMemo(
    () => getPreferredTrack(item, preferredSource),
    [item, preferredSource],
  )

  // Get album art from preferred track
  const artThumb = useMemo(() => {
    return preferredTrack?.album?.images?.find((img) => img.type === "image" && img.url)?.url
  }, [preferredTrack?.album?.images])

  // Get external URL from preferred track
  const externalUrl = useMemo(
    () => preferredTrack?.urls?.find((url) => url.type === "resource")?.url,
    [preferredTrack?.urls],
  )

  const boxSize = size === "sm" ? "40px" : "48px"

  if (!preferredTrack) {
    return null
  }

  return (
    <LinkBox>
      <Stack direction="row" gap={2} align="center">
        {artThumb ? (
          <Image
            loading="lazy"
            src={artThumb}
            alt={preferredTrack.album?.title}
            boxSize={boxSize}
            borderRadius="sm"
            objectFit="cover"
          />
        ) : (
          <Box
            boxSize={boxSize}
            bg="bg.muted"
            borderRadius="sm"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <LuMusic />
          </Box>
        )}
        <Stack direction="column" gap={0} flex={1} minW={0}>
          <LinkOverlay target="_blank" href={externalUrl}>
            <Text fontWeight="medium" fontSize="sm" truncate>
              {preferredTrack.title}
            </Text>
          </LinkOverlay>
          {preferredTrack.artists && preferredTrack.artists.length > 0 && (
            <HStack color="fg.muted" fontSize="xs" separator={<StackSeparator />}>
              {preferredTrack.artists.map((a) => (
                <Text key={a.id} as="span" truncate>
                  {a.title}
                </Text>
              ))}
            </HStack>
          )}
        </Stack>
      </Stack>
    </LinkBox>
  )
})

export default TrackDisplay
