import { useEffect, useMemo } from "react"
import { Box, Stack, Text, VStack } from "@chakra-ui/react"
import type { ItemDefinition, MetadataSourceTrack } from "@repo/types"
import { resolveItemRarity } from "@repo/game-logic"
import AlbumTrackListView, { type AlbumViewHeader } from "../../AlbumTrackListView"
import ItemArtwork from "../../ItemArtwork"
import { LinkifiedText } from "../../LinkifiedText"
import PathBreadcrumb from "../../PathBreadcrumb"
import { ItemRarityTag } from "../../PluginComponents/ItemRarityTag"
import { stopTrackPreview, toggleTrackPreview } from "../../../actors/trackPreviewActor"
import { useCanAddToQueue, useIsAdmin } from "../../../hooks/useActors"
import { useSocketMachine } from "../../../hooks/useSocketMachine"
import { artistsLabel, releaseYear } from "../../../lib/albumHeaderFields"
import {
  MEDIA_ITEM_TRACKS_EVENT_TYPES,
  mediaItemTracksMachine,
} from "../../../machines/mediaItemTracksMachine"
import useAddToQueue from "../../useAddToQueue"
import type { GameStateDetailFrame } from "../../../types/GameStateDetail"
import { LuArrowLeft } from "react-icons/lu"

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

  const [tracksState, sendTracks] = useSocketMachine(
    mediaItemTracksMachine,
    undefined,
    MEDIA_ITEM_TRACKS_EVENT_TYPES,
  )
  const tracks = tracksState.context.tracks
  const loading = tracksState.matches("loading")
  const error = tracksState.context.error

  useEffect(() => {
    if (!showTrackList || !mediaKey) {
      sendTracks({ type: "RESET" })
      return
    }

    sendTracks({ type: "FETCH", mediaKey })

    // `gameStateNavMachine` stops preview audio on every nav transition; this
    // covers the rest — unmounting because the game session or payload went away.
    return () => {
      stopTrackPreview()
    }
  }, [showTrackList, mediaKey, sendTracks])

  const name = definition?.name ?? frame.title
  const description = definition?.description
  const firstTrack = tracks[0]

  const albumHeader = useMemo((): AlbumViewHeader => {
    return {
      title: name,
      artists: artistsLabel(firstTrack?.artists),
      year: releaseYear(firstTrack?.album?.releaseDate),
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
        onPreview={(track, previewKey) =>
          toggleTrackPreview({
            trackKey: previewKey,
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
