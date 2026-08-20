import {
  Badge,
  Box,
  Center,
  HStack,
  ScrollArea,
  Spinner,
  Stack,
  StackSeparator,
  Text,
  VStack,
} from "@chakra-ui/react"
import type { ArtworkFrame, ItemRarity, MetadataSourceTrack, MetadataSourceUrl } from "@repo/types"
import { labelForMetadataSource } from "@repo/types"
import ItemArtwork from "./ItemArtwork"
import { LinkifiedText } from "./LinkifiedText"
import { ItemRarityTag } from "./PluginComponents/ItemRarityTag"
import ScrollShadowViewport from "./ScrollShadowViewport"
import TrackActionRow from "./TrackActionRow"
import { useTrackPreviewStatus } from "../hooks/useActors"
import { firstImageUrl, largestImageUrl } from "../lib/metadataImages"
import { trackPreviewKey } from "../lib/trackPreviewKey"

export type AlbumViewTrack = MetadataSourceTrack & { source?: string }

/** Header fields for the compact album / Physical Media row. */
export type AlbumViewHeader = {
  title: string
  artists?: string
  year?: string
  sourceId?: string
  imageUrl?: string
  imageUrlLarge?: string
  artworkFrame?: ArtworkFrame
  /** Fallback cover when `imageUrl` is omitted (e.g. browse album `images`). */
  images?: MetadataSourceUrl[]
  icon?: string
  rarity?: ItemRarity
  description?: string
}

type Props = {
  header: AlbumViewHeader | null
  tracks: AlbumViewTrack[]
  loading?: boolean
  error?: string | null
  emptyMessage?: string
  /**
   * Cap scrollport height. Ignored when `fillHeight` is set (parent flex layout
   * supplies the height).
   */
  maxH?: string | number
  /** Grow to fill a flex parent instead of using a fixed `maxH`. */
  fillHeight?: boolean
  disabled?: boolean
  defaultSourceId?: string
  canPreviewTrack?: (track: AlbumViewTrack) => boolean
  /** `previewKey` is the row's `trackPreviewActor` identity — pass it straight to `toggleTrackPreview`. */
  onPreview: (track: AlbumViewTrack, previewKey: string) => void
  onAddToQueue?: (track: AlbumViewTrack) => void
  showAddToQueue?: boolean | ((track: AlbumViewTrack) => boolean)
}

function AlbumTrackRow({
  track,
  previewKey,
  disabled,
  canPreview,
  onPreview,
  onAddToQueue,
}: {
  track: AlbumViewTrack
  previewKey: string
  disabled?: boolean
  canPreview: boolean
  onPreview: () => void
  onAddToQueue?: () => void
}) {
  const previewStatus = useTrackPreviewStatus(previewKey)
  return (
    <TrackActionRow
      track={track}
      showArtwork={false}
      detailLevel="titleDuration"
      disabled={disabled}
      previewStatus={previewStatus}
      canPreview={canPreview}
      onPreview={onPreview}
      onAddToQueue={onAddToQueue}
    />
  )
}

function AlbumHeader({ header }: { header: AlbumViewHeader }) {
  const coverUrl = header.imageUrl?.trim() || firstImageUrl(header.images)
  // Browse albums (Spotify, Local) only carry `images`; pick the biggest for preview.
  const largeCoverUrl = header.imageUrlLarge?.trim() || largestImageUrl(header.images)

  return (
    <HStack align="start" gap={3} px={1} pb={2} w="100%" minW={0}>
      <Box w="28" flexShrink={0}>
        <ItemArtwork
          imageUrl={coverUrl}
          imageUrlLarge={largeCoverUrl}
          icon={header.icon}
          rarity={header.rarity}
          artworkFrame={header.artworkFrame}
          size="feature"
          alt={header.title}
          previewable
        />
      </Box>
      <VStack align="start" gap={1} minW={0} flex="1" pt={1}>
        <Text fontWeight="semibold" lineClamp={2}>
          {header.title}
        </Text>
        {header.artists ? (
          <Text fontSize="sm" color="fg.muted" lineClamp={2}>
            {header.artists}
          </Text>
        ) : null}
        <HStack gap={2} flexWrap="wrap" align="center">
          {header.year ? (
            <Text fontSize="xs" color="fg.muted">
              {header.year}
            </Text>
          ) : null}
          {header.sourceId ? (
            <Badge size="sm" variant="subtle">
              {labelForMetadataSource(header.sourceId)}
            </Badge>
          ) : null}
          {header.rarity != null ? <ItemRarityTag size="sm" rarity={header.rarity} /> : null}
        </HStack>
        {header.description ? (
          <LinkifiedText fontSize="sm" color="fg.muted">
            {header.description}
          </LinkifiedText>
        ) : null}
      </VStack>
    </HStack>
  )
}

/**
 * Compact album / Physical Media view: hero row + track list in one scrollport.
 * Framed artwork opens the full-size preview dialog (ItemArtwork default).
 */
export default function AlbumTrackListView({
  header,
  tracks,
  loading = false,
  error = null,
  emptyMessage = "No tracks found.",
  maxH = "320px",
  fillHeight = false,
  disabled = false,
  defaultSourceId = "local",
  canPreviewTrack,
  onPreview,
  onAddToQueue,
  showAddToQueue = true,
}: Props) {
  const allowAdd =
    typeof showAddToQueue === "function" ? showAddToQueue : () => showAddToQueue === true

  return (
    <ScrollArea.Root
      size="sm"
      variant="hover"
      w="100%"
      {...(fillHeight
        ? { flex: "1 1 auto", minH: 0, height: "100%" }
        : { maxH })}
    >
      <ScrollShadowViewport {...(fillHeight ? { height: "100%" } : {})}>
        <ScrollArea.Content>
          <VStack align="stretch" gap={0} w="100%" pr={1} separator={<StackSeparator />}>
            {header ? <AlbumHeader header={header} /> : null}

            {loading ? (
              <Center py={6}>
                <Spinner size="sm" />
              </Center>
            ) : error ? (
              <Text fontSize="sm" color="fg.muted" py={2}>
                {error}
              </Text>
            ) : tracks.length === 0 ? (
              emptyMessage ? (
                <Text fontSize="sm" color="fg.muted" py={2}>
                  {emptyMessage}
                </Text>
              ) : null
            ) : (
              tracks.map((track, index) => {
                const source = track.source ?? defaultSourceId
                const canPreview = canPreviewTrack?.(track) ?? source === "local"
                const previewKey = trackPreviewKey(track, defaultSourceId)
                return (
                  <AlbumTrackRow
                    key={`${source}-${track.id}-${index}`}
                    track={track}
                    previewKey={previewKey}
                    disabled={disabled}
                    canPreview={canPreview}
                    onPreview={() => onPreview(track, previewKey)}
                    onAddToQueue={
                      onAddToQueue && allowAdd(track) ? () => onAddToQueue(track) : undefined
                    }
                  />
                )
              })
            )}
          </VStack>
        </ScrollArea.Content>
      </ScrollShadowViewport>
      <ScrollArea.Scrollbar>
        <ScrollArea.Thumb />
      </ScrollArea.Scrollbar>
      <ScrollArea.Corner />
    </ScrollArea.Root>
  )
}
