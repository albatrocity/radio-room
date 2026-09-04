import { useEffect, useMemo } from "react"
import { Box, HStack, Stack, Text, VStack } from "@chakra-ui/react"
import type { ItemDefinition, ItemShopsUserGameState, MediaCondition, MetadataSourceTrack } from "@repo/types"
import { isMediaCondition, ITEM_SHOPS_PLUGIN_NAME, PHYSICAL_MEDIA_CONDITION_KEY } from "@repo/types"
import { resolveItemRarity } from "@repo/game-logic"
import AlbumTrackListView, { type AlbumViewHeader } from "../../AlbumTrackListView"
import ItemArtwork from "../../ItemArtwork"
import { LinkifiedText } from "../../LinkifiedText"
import PathBreadcrumb from "../../PathBreadcrumb"
import { ItemRarityTag } from "../../PluginComponents/ItemRarityTag"
import { MediaConditionTag } from "../../PluginComponents/MediaConditionTag"
import { resolveDisplayArtworkFrame } from "../../../lib/resolveDisplayArtworkFrame"
import { stopTrackPreview, toggleTrackPreview } from "../../../actors/trackPreviewActor"
import { useCanAddToQueue, useIsAdmin } from "../../../hooks/useActors"
import { useSocketMachine } from "../../../hooks/useSocketMachine"
import { artistsLabel, releaseYear } from "../../../lib/albumHeaderFields"
import {
  MEDIA_ITEM_TRACKS_EVENT_TYPES,
  mediaItemTracksMachine,
} from "../../../machines/mediaItemTracksMachine"
import useAddToQueue from "../../useAddToQueue"
import type { GameStateItemDetailFrame } from "../../../types/GameStateDetail"
import { LuChevronLeft } from "react-icons/lu"
import { useUserGameState } from "../UserGameStateContext"
import InventoryGiftSellControls from "./InventoryGiftSellControls"
import ShopDetailBuyControls from "./ShopDetailBuyControls"

type Props = {
  frame: GameStateItemDetailFrame
  definition?: ItemDefinition
  /** Fill leftover panel height via the explicit flex chain (lg+ integrated panel). */
  fillHeight?: boolean
}

/**
 * Gift/sell for a held collection item. Shop detail never owns the item, and
 * bag items keep these actions on the inventory row.
 */
function CollectionGiftSell({
  frame,
  definition,
  padded = false,
}: {
  frame: GameStateItemDetailFrame
  definition?: ItemDefinition
  padded?: boolean
}) {
  const gameState = useUserGameState()
  if (frame.source !== "inventory") return null
  if (definition?.slotPool !== "collection") return null
  const item = gameState?.inventory?.items.find((entry) => entry.itemId === frame.inventoryItemId)
  if (!item) return null
  const controls = <InventoryGiftSellControls item={item} definition={definition} layout="split" />
  if (!padded) return controls
  return (
    <Box px={1} py={2}>
      {controls}
    </Box>
  )
}

/** Inventory Gift/Sell or shop Buy, in the same slot above the track list. */
function ItemDetailPrimaryActions({
  frame,
  definition,
  padded = false,
}: {
  frame: GameStateItemDetailFrame
  definition?: ItemDefinition
  padded?: boolean
}) {
  if (frame.source === "shop") {
    return <ShopDetailBuyControls frame={frame} padded={padded} />
  }
  return <CollectionGiftSell frame={frame} definition={definition} padded={padded} />
}

/**
 * Game State item detail body (ADR 0104): lore + optional trackList album view.
 */
export default function GameStateItemDetail({ frame, definition, fillHeight = false }: Props) {
  const isAdmin = useIsAdmin()
  const canAddToQueue = useCanAddToQueue()
  const { addToQueue } = useAddToQueue()
  const gameState = useUserGameState()
  const layout = definition?.detailView?.layout ?? "default"
  const showTrackList = layout === "trackList"
  const mediaKey = frame.mediaKey?.trim() || undefined

  const inventoryItem =
    frame.source === "inventory" && frame.inventoryItemId
      ? gameState?.inventory?.items.find((entry) => entry.itemId === frame.inventoryItemId)
      : undefined
  const canAdd =
    frame.source === "inventory" &&
    Boolean(inventoryItem) &&
    (isAdmin || canAddToQueue) &&
    Boolean(mediaKey)
  const shopOffer =
    frame.source === "shop" && frame.shopOfferId != null
      ? gameState
          ?.getPluginState<ItemShopsUserGameState>(ITEM_SHOPS_PLUGIN_NAME)
          ?.currentShopInstance?.offers.find((row) => row.offerId === frame.shopOfferId)
      : undefined
  const rawCondition = inventoryItem?.metadata?.[PHYSICAL_MEDIA_CONDITION_KEY]
  const condition: MediaCondition | undefined = isMediaCondition(rawCondition)
    ? rawCondition
    : shopOffer?.condition
  const artworkFrame = resolveDisplayArtworkFrame({
    mediaFormat: shopOffer?.mediaFormat ?? definition?.mediaFormat,
    condition,
    artworkFrame: shopOffer?.artworkFrame ?? definition?.artworkFrame,
  })

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
      artists: definition?.artist?.trim() || artistsLabel(firstTrack?.artists),
      year: releaseYear(firstTrack?.album?.releaseDate),
      sourceId: "local",
      imageUrl: definition?.imageUrl,
      imageUrlLarge: definition?.imageUrlLarge,
      artworkFrame,
      icon: definition?.icon,
      rarity: definition != null ? resolveItemRarity(definition) : undefined,
      condition,
      description,
    }
  }, [name, description, definition, firstTrack, artworkFrame, condition])

  const primaryActions = <ItemDetailPrimaryActions frame={frame} definition={definition} />

  if (showTrackList) {
    if (!mediaKey) {
      return (
        <Text fontSize="sm" color="fg.muted" pt={2}>
          No track list is available for this item.
        </Text>
      )
    }

    const list = (
      <AlbumTrackListView
        header={albumHeader}
        tracks={tracks}
        loading={loading}
        error={error}
        fillHeight={fillHeight}
        maxH={fillHeight ? undefined : "min(60vh, 28rem)"}
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
        beforeTracks={<ItemDetailPrimaryActions frame={frame} definition={definition} padded />}
      />
    )
    if (!fillHeight) return list
    return (
      <Box flex="1" minH={0} w="full" display="flex" flexDirection="column" overflow="hidden">
        {list}
      </Box>
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
          artworkFrame={artworkFrame}
          size="feature"
          alt={name}
        />
      </Box>
      <VStack gap={2} w="100%" maxW="sm" align="center">
        <Text fontWeight="semibold" fontSize="lg" textAlign="center">
          {name}
        </Text>
        <HStack gap={2} flexWrap="wrap" justify="center">
          {definition != null && <ItemRarityTag size="sm" rarity={resolveItemRarity(definition)} />}
          {condition != null && <MediaConditionTag size="sm" condition={condition} />}
        </HStack>
        {description ? (
          <LinkifiedText fontSize="sm" color="fg.muted" textAlign="center">
            {description}
          </LinkifiedText>
        ) : null}
        {primaryActions}
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
      flexShrink={0}
      items={[
        { label: tabLabel, onClick: onBack, icon: <LuChevronLeft /> },
        { label: detailTitle },
      ]}
    />
  )
}
