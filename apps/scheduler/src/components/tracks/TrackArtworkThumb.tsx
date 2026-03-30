import { Box, Flex } from "@chakra-ui/react"
import { Disc3 } from "lucide-react"
import type { QueueItem } from "@repo/types/Queue"
import { queueItemCoverUrl } from "./queueItemDisplay"

export function TrackArtworkThumb({ item }: { item: QueueItem }) {
  const url = queueItemCoverUrl(item)
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
