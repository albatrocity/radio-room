import { useEffect, useState } from "react"
import { Center, CloseButton, Dialog, HStack, Portal, Spinner, Text, VStack } from "@chakra-ui/react"
import type { ArtworkFrame, MetadataSourceTrack, ShopOffer } from "@repo/types"
import ItemArtwork from "./ItemArtwork"
import { FRAMED_ARTWORK_BOX_SIZE } from "./artworkFrames/frameStyles"
import TrackActionRow from "./TrackActionRow"
import { emitToSocket, subscribeById, unsubscribeById } from "../actors/socketActor"
import { stopTrackPreview, toggleTrackPreview } from "../actors/trackPreviewActor"
import { useTrackPreviewStatus } from "../hooks/useActors"

type TrackWithSource = MetadataSourceTrack & { source?: string }

type PreviewTarget = {
  name: string
  imageUrl?: string
  imageUrlLarge?: string
  artworkFrame?: ArtworkFrame
  shortId?: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: PreviewTarget | null
}

function trackKey(track: TrackWithSource) {
  return `${track.source ?? "local"}-${track.id}`
}

function PreviewTrackRow({
  track,
  item,
  mediaKey,
}: {
  track: TrackWithSource
  item: PreviewTarget
  mediaKey: string
}) {
  const key = trackKey(track)
  const previewStatus = useTrackPreviewStatus(key)

  return (
    <TrackActionRow
      track={track}
      artworkOverride={
        item.artworkFrame
          ? {
              imageUrl: item.imageUrl,
              imageUrlLarge: item.imageUrlLarge,
              artworkFrame: item.artworkFrame,
              name: item.name,
            }
          : undefined
      }
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
    />
  )
}

export function MediaItemPreviewDialog({ open, onOpenChange, item }: Props) {
  const [tracks, setTracks] = useState<TrackWithSource[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const subscriptionId = "media-item-preview-dialog"
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
    return () => unsubscribeById(subscriptionId)
  }, [])

  useEffect(() => {
    if (!open || !item?.shortId) {
      setTracks([])
      setError(null)
      setLoading(false)
      stopTrackPreview()
      return
    }
    setLoading(true)
    setError(null)
    emitToSocket("LIST_MEDIA_ITEM_TRACKS", { mediaKey: item.shortId })
  }, [open, item?.shortId])

  useEffect(() => {
    if (!open) {
      stopTrackPreview()
    }
  }, [open])

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => onOpenChange(e.open)}
      placement="center"
      lazyMount
      unmountOnExit
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW="lg" maxH="85vh" display="flex" flexDirection="column">
            <Dialog.Header pr="10">
              <HStack gap={3} align="center" minW={0}>
                {item && (
                  <ItemArtwork
                    imageUrl={item.imageUrl}
                    imageUrlLarge={item.imageUrlLarge}
                    artworkFrame={item.artworkFrame}
                    boxSize={item.artworkFrame ? FRAMED_ARTWORK_BOX_SIZE : 10}
                    alt={item.name}
                  />
                )}
                <VStack align="start" gap={0} minW={0}>
                  <Dialog.Title truncate>{item?.name ?? "Preview"}</Dialog.Title>
                  <Text fontSize="xs" color="fg.muted">
                    Hear a short clip before you buy
                  </Text>
                </VStack>
              </HStack>
              <Dialog.CloseTrigger asChild position="absolute" top="2" right="2">
                <CloseButton size="sm" />
              </Dialog.CloseTrigger>
            </Dialog.Header>
            <Dialog.Body overflowY="auto" px={2} pb={4}>
              {loading ? (
                <Center py={8}>
                  <Spinner size="sm" />
                </Center>
              ) : error ? (
                <Text fontSize="sm" color="fg.muted" py={4} px={2}>
                  {error}
                </Text>
              ) : tracks.length === 0 ? (
                <Text fontSize="sm" color="fg.muted" py={4} px={2}>
                  No tracks found.
                </Text>
              ) : (
                <VStack align="stretch" gap={0}>
                  {item?.shortId &&
                    tracks.map((track) => (
                      <PreviewTrackRow
                        key={track.id}
                        track={track}
                        item={item}
                        mediaKey={item.shortId!}
                      />
                    ))}
                </VStack>
              )}
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}

/** Shop-offer adapter so the dialog does not take a full ShopOffer. */
export function shopOfferPreviewTarget(offer: ShopOffer): PreviewTarget {
  return {
    name: offer.name,
    imageUrl: offer.imageUrl,
    imageUrlLarge: offer.imageUrlLarge,
    artworkFrame: offer.artworkFrame,
    shortId: offer.shortId,
  }
}
