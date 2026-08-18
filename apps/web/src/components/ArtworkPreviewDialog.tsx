import { Box, Dialog, Portal } from "@chakra-ui/react"
import type { PhysicalMediaArt } from "../lib/physicalMediaArtwork"
import FramedArtwork from "./artworkFrames/FramedArtwork"

type Props = {
  art: PhysicalMediaArt
  alt?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Viewport-fitted framed sleeve/case preview (ADR 0099 `feature` size). */
export function ArtworkPreviewDialog({ art, alt = "", open, onOpenChange }: Props) {
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
            w="min(90vw, 90vh)"
            h="min(90vw, 90vh)"
            overflow="visible"
          >
            <Dialog.Header p="0" m="0" h="0" overflow="hidden" border="none">
              <Dialog.Title>{alt.trim() || "Artwork"}</Dialog.Title>
            </Dialog.Header>
            <Box w="full" h="full">
              <FramedArtwork
                art={art}
                size="feature"
                squareSlot
                alt={alt}
                idPrefix="artwork-preview"
              />
            </Box>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
