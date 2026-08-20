import { useEffect, useMemo, useState } from "react"
import { Box, Stack, Text, VStack } from "@chakra-ui/react"
import type { ItemDefinition, MetadataSourceTrack } from "@repo/types"
import { resolveItemRarity } from "@repo/game-logic"
import AlbumTrackListView, { type AlbumViewHeader } from "../../AlbumTrackListView"
import ItemArtwork from "../../ItemArtwork"
import { LinkifiedText } from "../../LinkifiedText"
import PathBreadcrumb from "../../PathBreadcrumb"
import { ItemRarityTag } from "../../PluginComponents/ItemRarityTag"
import { emitToSocket, subscribeById, unsubscribeById } from "../../../actors/socketActor"
import { stopTrackPreview, toggleTrackPreview } from "../../../actors/trackPreviewActor"
import { useCanAddToQueue, useIsAdmin } from "../../../hooks/useActors"
import useAddToQueue from "../../useAddToQueue"
import type { GameStateDetailFrame } from "../../../types/GameStateDetail"
import { LuArrowLeft } from "react-icons/lu"

type TrackWithSource = MetadataSourceTrack & { source?: string }

type Props = {
  frame: GameStateDetailFrame
  definition?: ItemDefinition
}

/**
 * Game State item detail body (ADR 0104): lore + optional trackList album view.
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
  const firstTrack = tracks[0]

  const albumHeader = useMemo((): AlbumViewHeader => {
    const artists =
      firstTrack?.artists
        ?.map((a) => a.title)
        .filter(Boolean)
        .join(", ") || undefined
    const year = firstTrack?.album?.releaseDate?.split("-")[0] || undefined
    return {
      title: name,
      artists,
      year,
      sourceId: "local",
      imageUrl: definition?.imageUrl,
      imageUrlLarge: definition?.imageUrlLarge,
      artworkFrame: definition?.artworkFrame,
      icon: definition?.icon,
      rarity: definition != null ? resolveItemRarity(definition) : undefined,
      description,
    }
  }, [name, description, definition, firstTrack])

  if (showTrackList) {
    if (!mediaKey) {
      return (
        <Text fontSize="sm" color="fg.muted" pt={2}>
          No track list is available for this item.
        </Text>
      )
    }

    return (
      <AlbumTrackListView
        header={albumHeader}
        tracks={tracks}
        loading={loading}
        error={error}
        maxH="min(60vh, 28rem)"
        defaultSourceId="local"
        canPreviewTrack={() => true}
        onPreview={(track) =>
          toggleTrackPreview({
            trackKey: `${track.source ?? "local"}-${track.id}`,
            trackId: track.id,
            mediaKey,
            source: "local",
          })
        }
        onAddToQueue={(track) => addToQueue({ ...track, source: "local" } as MetadataSourceTrack)}
        showAddToQueue={canAdd}
      />
    )
  }

  // Lore-only (`layout: "default"`): compact artwork + description.
  return (
    <Stack gap={4} pt={2} direction="column" align="center">
      <Box w="28">
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
      <VStack gap={2} w="100%" maxW="sm" align="center">
        <Text fontWeight="semibold" fontSize="lg" textAlign="center">
          {name}
        </Text>
        {definition != null && <ItemRarityTag size="sm" rarity={resolveItemRarity(definition)} />}
        {description ? (
          <LinkifiedText fontSize="sm" color="fg.muted" textAlign="center">
            {description}
          </LinkifiedText>
        ) : null}
      </VStack>
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
