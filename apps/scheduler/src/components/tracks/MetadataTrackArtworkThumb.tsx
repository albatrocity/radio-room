import { Box, Flex } from "@chakra-ui/react"
import { Disc3 } from "lucide-react"
import type { MetadataSourceTrack } from "@repo/types/MetadataSource"
import { metadataTrackCoverUrl } from "./metadataTrackDisplay"

export function MetadataTrackArtworkThumb({ track }: { track: MetadataSourceTrack }) {
  const url = metadataTrackCoverUrl(track)
  if (url) {
    return (
      <Box
        w="40px"
        h="40px"
        flexShrink={0}
        borderRadius="md"
        overflow="hidden"
        bg="bg.muted"
      >
        <img
          src={url}
          alt=""
          loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      </Box>
    )
  }
  return (
    <Flex
      w="40px"
      h="40px"
      flexShrink={0}
      borderRadius="md"
      bg="bg.emphasized"
      align="center"
      justify="center"
      color="fg.muted"
      aria-hidden
    >
      <Disc3 size={20} strokeWidth={1.5} />
    </Flex>
  )
}
