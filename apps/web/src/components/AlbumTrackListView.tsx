import { type ReactNode } from "react"
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
import type {
  ArtworkFrame,
  ItemRarity,
  MediaCondition,
  MetadataSourceTrackWithSource,
  MetadataSourceUrl,
} from "@repo/types"
import { labelForMetadataSource } from "@repo/types"
import type { GetTrackPresence } from "../hooks/useTrackRoomPresence"
import type { TrackRoomPresence } from "../lib/trackRoomPresence"
import ItemArtwork from "./ItemArtwork"
import { LinkifiedText } from "./LinkifiedText"
import { ItemRarityTag } from "./PluginComponents/ItemRarityTag"
import { MediaConditionTag } from "./PluginComponents/MediaConditionTag"
import ScrollShadowViewport from "./ScrollShadowViewport"
import TrackActionRow from "./TrackActionRow"
import { useTrackPreviewStatus } from "../hooks/useActors"
import { firstImageUrl, largestImageUrl } from "../lib/metadataImages"
import { trackPreviewKey } from "../lib/trackPreviewKey"

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
  condition?: MediaCondition
  description?: string
}

type Props = {
  header: AlbumViewHeader | null
  tracks: MetadataSourceTrackWithSource[]
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
  canPreviewTrack?: (track: MetadataSourceTrackWithSource) => boolean
  /** `previewKey` is the row's `trackPreviewActor` identity — pass it straight to `toggleTrackPreview`. */
  onPreview: (track: MetadataSourceTrackWithSource, previewKey: string) => void
  onAddToQueue?: (track: MetadataSourceTrackWithSource) => void
  showAddToQueue?: boolean | ((track: MetadataSourceTrackWithSource) => boolean)
  /** Rendered between the album header and the track list. */
  beforeTracks?: ReactNode
  getTrackPresence?: GetTrackPresence
}

function AlbumTrackRow({
  track,
  previewKey,
  disabled,
  canPreview,
  onPreview,
  onAddToQueue,
  presence,
}: {
  track: MetadataSourceTrackWithSource
  previewKey: string
  disabled?: boolean
  canPreview: boolean
  onPreview: () => void
  onAddToQueue?: () => void
  presence?: TrackRoomPresence
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
      presence={presence}
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
      <VStack align="start" gap={1} minW={0} flex="1" pt={1} overflow="hidden">
        <Text fontWeight="semibold" lineClamp={2} minW={0} w="100%">
          {header.title}
        </Text>
        {header.artists ? (
          <Text fontSize="sm" color="fg.muted" lineClamp={2} minW={0} w="100%">
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
          {header.condition != null ? (
            <MediaConditionTag size="sm" condition={header.condition} />
          ) : null}
        </HStack>
        {header.description ? (
          <LinkifiedText fontSize="sm" color="fg.muted" lineClamp={2}>
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
  beforeTracks,
  getTrackPresence,
}: Props) {
  const allowAdd =
    typeof showAddToQueue === "function" ? showAddToQueue : () => showAddToQueue === true

  return (
    <ScrollArea.Root
      size="sm"
      variant="hover"
      w="100%"
      {...(fillHeight ? { flex: "1 1 auto", minH: 0, height: "100%" } : { maxH })}
    >
      <ScrollShadowViewport {...(fillHeight ? { height: "100%" } : {})}>
        <ScrollArea.Content>
          <VStack align="stretch" gap={0} w="100%" pr={1} separator={<StackSeparator />}>
            {header ? <AlbumHeader header={header} /> : null}
            {beforeTracks}

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
                    presence={getTrackPresence?.(track.id)}
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
