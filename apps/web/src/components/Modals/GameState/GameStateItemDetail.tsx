import { useEffect, useMemo, useState } from "react"
import { Box, Center, Spinner, Stack, Text, VStack } from "@chakra-ui/react"
import type { ItemDefinition, MetadataSourceTrack } from "@repo/types"
import { resolveItemRarity } from "@repo/game-logic"
import ItemArtwork from "../../ItemArtwork"
import { LinkifiedText } from "../../LinkifiedText"
import TrackActionRow from "../../TrackActionRow"
import { ItemRarityTag } from "../../PluginComponents/ItemRarityTag"
import { emitToSocket, subscribeById, unsubscribeById } from "../../../actors/socketActor"
import { stopTrackPreview, toggleTrackPreview } from "../../../actors/trackPreviewActor"
import { useCanAddToQueue, useIsAdmin, useTrackPreviewStatus } from "../../../hooks/useActors"
import useAddToQueue from "../../useAddToQueue"
import type { GameStateDetailFrame } from "../../../types/GameStateDetail"
import PathBreadcrumb from "../../PathBreadcrumb"
import { LuArrowLeft } from "react-icons/lu"

type TrackWithSource = MetadataSourceTrack & { source?: string }

type Props = {
  frame: GameStateDetailFrame
  definition?: ItemDefinition
}

function trackKey(track: TrackWithSource) {
  return `${track.source ?? "local"}-${track.id}`
}

function DetailTrackRow({
  track,
  mediaKey,
  canAdd,
  onAdd,
}: {
  track: TrackWithSource
  mediaKey: string
  canAdd: boolean
  onAdd: (track: TrackWithSource) => void
}) {
  const key = trackKey(track)
  const previewStatus = useTrackPreviewStatus(key)

  return (
    <TrackActionRow
      track={track}
      showArtwork={false}
      previewStatus={previewStatus}
      canPreview
      onPreview={() =>
        toggleTrackPreview({
          trackKey: key,
          trackId: track.id,
          mediaKey,
          source: "local",
        })
      }
      onAddToQueue={canAdd ? () => onAdd(track) : undefined}
    />
  )
}

/**
 * Game State item detail body (ADR 0104): lore + optional trackList.
 */
export default function GameStateItemDetail({ frame, definition }: Props) {
  const isAdmin = useIsAdmin()
  const canAddToQueue = useCanAddToQueue()
  const { addToQueue } = useAddToQueue()
  const layout = definition?.detailView?.layout ?? "default"
  const showTrackList = layout === "trackList"
  const mediaKey = frame.mediaKey?.trim() || undefined
  const canAdd = frame.source === "inventory" && (isAdmin || canAddToQueue) && Boolean(mediaKey)

  const [tracks, setTracks] = useState<TrackWithSource[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const subscriptionId = useMemo(() => `game-state-item-detail-${frame.shortId}`, [frame.shortId])

  useEffect(() => {
    if (!showTrackList || !mediaKey) {
      setTracks([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    subscribeById(subscriptionId, {
      send: (event) => {
        if (event.type === "LIST_MEDIA_ITEM_TRACKS_RESULTS") {
          setTracks((event.data.tracks ?? []) as TrackWithSource[])
          setLoading(false)
          setError(null)
        }
        if (event.type === "LIST_MEDIA_ITEM_TRACKS_FAILURE") {
          setTracks([])
          setLoading(false)
          setError(event.data?.message ?? "Failed to load tracks")
        }
      },
      eventTypes: ["LIST_MEDIA_ITEM_TRACKS_RESULTS", "LIST_MEDIA_ITEM_TRACKS_FAILURE"],
    })
    emitToSocket("LIST_MEDIA_ITEM_TRACKS", { mediaKey })

    return () => {
      unsubscribeById(subscriptionId)
      stopTrackPreview()
    }
  }, [showTrackList, mediaKey, subscriptionId])

  const name = definition?.name ?? frame.title
  const description = definition?.description

  return (
    <Stack gap={4} pt={2}>
      <Stack direction="column" align="center" gap={4}>
        <Box w="full" maxW="sm">
          <ItemArtwork
            imageUrl={definition?.imageUrl}
            imageUrlLarge={definition?.imageUrlLarge}
            icon={definition?.icon}
            rarity={definition?.rarity}
            artworkFrame={definition?.artworkFrame}
            size="feature"
            alt={name}
          />
        </Box>
        <VStack gap={4} w="100%" flex="1">
          <Text fontWeight="semibold" fontSize="lg" textAlign="center">
            {name}
          </Text>
          {definition != null && <ItemRarityTag size="sm" rarity={resolveItemRarity(definition)} />}
          {description ? (
            <LinkifiedText fontSize="sm" color="fg.muted">
              {description}
            </LinkifiedText>
          ) : null}
        </VStack>
      </Stack>

      {showTrackList && !mediaKey ? (
        <Text fontSize="sm" color="fg.muted">
          No track list is available for this item.
        </Text>
      ) : null}

      {showTrackList && mediaKey ? (
        <Box>
          {loading ? (
            <Center py={6}>
              <Spinner size="sm" />
            </Center>
          ) : error ? (
            <Text fontSize="sm" color="fg.muted" py={2}>
              {error}
            </Text>
          ) : tracks.length === 0 ? (
            <Text fontSize="sm" color="fg.muted" py={2}>
              No tracks found.
            </Text>
          ) : (
            <VStack align="stretch" gap={0}>
              {tracks.map((track) => (
                <DetailTrackRow
                  key={track.id}
                  track={track}
                  mediaKey={mediaKey}
                  canAdd={canAdd}
                  onAdd={(t) => addToQueue({ ...t, source: "local" } as MetadataSourceTrack)}
                />
              ))}
            </VStack>
          )}
        </Box>
      ) : null}
    </Stack>
  )
}

type BreadcrumbProps = {
  tabLabel: string
  detailTitle: string
  onBack: () => void
}

export function GameStateDetailBreadcrumb({ tabLabel, detailTitle, onBack }: BreadcrumbProps) {
  return (
    <PathBreadcrumb
      pt={3}
      pb={1}
      color="fg.muted"
      size="sm"
      items={[
        { label: tabLabel, onClick: onBack, icon: <LuArrowLeft /> },
        { label: detailTitle },
      ]}
    />
  )
}
