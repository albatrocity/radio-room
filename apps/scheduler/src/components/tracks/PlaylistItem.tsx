import { forwardRef, type ReactNode } from "react"
import { Box, Flex, Text, VStack, type FlexProps } from "@chakra-ui/react"
import { Disc3 } from "lucide-react"

export type PlaylistItemLines = {
  title: string
  artistLine?: string | null
  albumLine?: string | null
  coverUrl?: string | null
}

export function PlaylistArtworkThumb({ coverUrl }: { coverUrl?: string | null }) {
  if (coverUrl) {
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
          src={coverUrl}
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

export function PlaylistItemText({
  title,
  artistLine,
  albumLine,
}: Pick<PlaylistItemLines, "title" | "artistLine" | "albumLine">) {
  return (
    <VStack align="start" gap={0} flex="1" minW={0}>
      <Text fontSize="sm" fontWeight="medium" w="full" truncate>
        {title}
      </Text>
      {artistLine ? (
        <Text fontSize="xs" color="fg.muted" w="full" truncate>
          {artistLine}
        </Text>
      ) : null}
      {albumLine ? (
        <Text fontSize="xs" color="fg.muted" w="full" truncate>
          {albumLine}
        </Text>
      ) : null}
    </VStack>
  )
}

type PlaylistItemShellProps = PlaylistItemLines &
  FlexProps & {
    leading?: ReactNode
    trailing?: ReactNode
  }

export const PlaylistItemShell = forwardRef<HTMLDivElement, PlaylistItemShellProps>(
  function PlaylistItemShell(
    { title, artistLine, albumLine, coverUrl, leading, trailing, ...flexProps },
    ref,
  ) {
    return (
      <Flex ref={ref} align="center" gap={2} py={2} px={3} {...flexProps}>
        {leading}
        <PlaylistArtworkThumb coverUrl={coverUrl} />
        <PlaylistItemText title={title} artistLine={artistLine} albumLine={albumLine} />
        {trailing}
      </Flex>
    )
  },
)
