import { Box, Dialog, Image, Portal } from "@chakra-ui/react"
import { parseArtworkFrame } from "@repo/types"
import type { PhysicalMediaArt } from "../lib/physicalMediaArtwork"
import FramedArtwork from "./artworkFrames/FramedArtwork"
import { frameContentRatio } from "./artworkFrames/frameStyles"

type Props = {
  /** Physical Media sleeve/case. Omit for plain covers (Spotify, Local albums). */
  art?: PhysicalMediaArt
  /** Unframed cover URL; ignored when `art` is set. */
  imageUrl?: string
  alt?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Viewport-fitted artwork preview: framed sleeve (ADR 0099) or plain cover. */
export function ArtworkPreviewDialog({ art, imageUrl, alt = "", open, onOpenChange }: Props) {
  if (!art && !imageUrl) return null

  const ratio = art ? frameContentRatio(parseArtworkFrame(art.artworkFrame) ?? art.artworkFrame) : null
  const framedSizing = ratio
    ? {
        w: `min(90vw, calc(90vh * ${ratio.width / ratio.height}))`,
        aspectRatio: `${ratio.width} / ${ratio.height}`,
      }
    : { w: "auto", maxW: "90vw", maxH: "90vh" }

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
          <Dialog.Content
            bg="transparent"
            boxShadow="none"
            p="0"
            maxW="none"
            overflow="hidden"
            {...framedSizing}
          >
            <Dialog.Header p="0" m="0" h="0" overflow="hidden" border="none">
              <Dialog.Title>{alt.trim() || "Artwork"}</Dialog.Title>
            </Dialog.Header>
            {art ? (
              <Box w="full" h="full">
                <FramedArtwork art={art} size="feature" alt={alt} idPrefix="artwork-preview" />
              </Box>
            ) : (
              <Image
                src={imageUrl}
                alt={alt}
                maxW="90vw"
                maxH="90vh"
                objectFit="contain"
                borderRadius="sm"
              />
            )}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
