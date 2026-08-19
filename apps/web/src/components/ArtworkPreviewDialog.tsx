import { Box, Dialog, Portal } from "@chakra-ui/react"
import { parseArtworkFrame } from "@repo/types"
import type { PhysicalMediaArt } from "../lib/physicalMediaArtwork"
import FramedArtwork from "./artworkFrames/FramedArtwork"
import { frameContentRatio } from "./artworkFrames/frameStyles"

type Props = {
  art: PhysicalMediaArt
  alt?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Viewport-fitted framed sleeve/case preview (ADR 0099 `feature` size). */
export function ArtworkPreviewDialog({ art, alt = "", open, onOpenChange }: Props) {
  const frame = parseArtworkFrame(art.artworkFrame) ?? art.artworkFrame
  const ratio = frameContentRatio(frame)
  const ratioValue = ratio.width / ratio.height

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
            w={`min(90vw, calc(90vh * ${ratioValue}))`}
            aspectRatio={`${ratio.width} / ${ratio.height}`}
            overflow="hidden"
          >
            <Dialog.Header p="0" m="0" h="0" overflow="hidden" border="none">
              <Dialog.Title>{alt.trim() || "Artwork"}</Dialog.Title>
            </Dialog.Header>
            <Box w="full" h="full">
              <FramedArtwork
                art={art}
                size="feature"
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
