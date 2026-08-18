import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Box, Image, type BoxProps } from "@chakra-ui/react"
import { parseArtworkFrame } from "@repo/types"
import type { PhysicalMediaArt } from "../../lib/physicalMediaArtwork"
import ArtworkFrameOverlay from "./ArtworkFrameOverlay"
import {
  ArtworkOverlaySizeContext,
  type ArtworkOverlaySize,
} from "./ArtworkOverlaySizeContext"
import {
  dieCutMaskStyles,
  frameArtworkInset,
  frameContentRatio,
  framedArtworkLayout,
  framedMediaShadow,
  type ArtworkSizePreset,
} from "./frameStyles"

const pct = (fraction: number) => `${fraction * 100}%`

function srcForSize(art: PhysicalMediaArt, size: ArtworkSizePreset): string {
  if (size === "feature") return art.imageUrlLarge?.trim() || art.imageUrl
  return art.imageUrl
}

type Props = {
  art: PhysicalMediaArt
  size: ArtworkSizePreset
  alt?: string
  idPrefix?: string
  flexShrink?: BoxProps["flexShrink"]
  /**
   * Occupy a square of the given size and center the physical object in it.
   * Keeps list columns aligned when a cassette is narrower than a sleeve.
   */
  squareSlot?: boolean
}

/**
 * Cover art with a Physical Media overlay. The framed object is square for
 * sleeves/jewel cases and portrait for cassettes. Pass `squareSlot` when a list
 * needs a consistent square column. `size` picks layout and which cover variant
 * to load (`feature` prefers `imageUrlLarge`).
 */
export default function FramedArtwork({
  art,
  size,
  alt = "",
  idPrefix,
  flexShrink = 0,
  squareSlot = false,
}: Props) {
  const frame = parseArtworkFrame(art.artworkFrame) ?? art.artworkFrame
  const isDieCut = frame === "die-cut-jacket"
  const ratio = frameContentRatio(frame)
  const inset = frameArtworkInset(frame)
  const layout = framedArtworkLayout(size)
  const height = layout.boxSize ?? layout.height
  const slotSize =
    layout.boxSize != null ? { boxSize: layout.boxSize } : { w: height, h: height }
  const displayUrl = srcForSize(art, size)
  const fallbackImageUrl = art.fallbackImageUrl

  const contentRef = useRef<HTMLDivElement>(null)
  const [contentSize, setContentSize] = useState<ArtworkOverlaySize>()
  const [src, setSrc] = useState(displayUrl)

  useEffect(() => {
    setSrc(displayUrl)
  }, [displayUrl])

  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el) return

    const sync = () => {
      const { width, height: measuredHeight } = el.getBoundingClientRect()
      if (width > 0 && measuredHeight > 0) {
        setContentSize({ width: Math.round(width), height: Math.round(measuredHeight) })
      }
    }

    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const object = (
    <Box
      position="relative"
      display="inline-block"
      flexShrink={squareSlot ? undefined : flexShrink}
      h={squareSlot ? "100%" : height}
      w="auto"
      aspectRatio={`${ratio.width} / ${ratio.height}`}
      verticalAlign="middle"
      lineHeight={0}
      {...framedMediaShadow}
    >
      <Box
        ref={contentRef}
        position="relative"
        w="100%"
        h="100%"
        borderRadius={0}
        overflow="hidden"
        {...(isDieCut ? dieCutMaskStyles : {})}
      >
        <Image
          position="absolute"
          top={pct(inset.top)}
          left={pct(inset.left)}
          w={pct(1 - inset.left - inset.right)}
          h={pct(1 - inset.top - inset.bottom)}
          src={src}
          alt={alt}
          borderRadius={0}
          objectFit="cover"
          objectPosition="center"
          loading="lazy"
          maxW="none"
          onError={() => {
            const fallback = fallbackImageUrl?.trim()
            if (fallback && src !== fallback) setSrc(fallback)
          }}
        />
        <ArtworkFrameOverlay frame={frame} idPrefix={idPrefix} />
      </Box>
    </Box>
  )

  return (
    <ArtworkOverlaySizeContext.Provider value={contentSize}>
      {squareSlot ? (
        <Box
          display="flex"
          alignItems="center"
          justifyContent="center"
          flexShrink={flexShrink}
          overflow="visible"
          {...slotSize}
        >
          {object}
        </Box>
      ) : (
        object
      )}
    </ArtworkOverlaySizeContext.Provider>
  )
}
