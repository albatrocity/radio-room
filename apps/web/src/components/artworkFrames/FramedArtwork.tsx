import { useLayoutEffect, useRef, useState } from "react"
import { Box, Image, type BoxProps } from "@chakra-ui/react"
import { parseArtworkFrame, type ArtworkFrame } from "@repo/types"
import ArtworkFrameOverlay from "./ArtworkFrameOverlay"
import {
  ArtworkOverlaySizeContext,
  type ArtworkOverlaySize,
} from "./ArtworkOverlaySizeContext"
import {
  dieCutMaskStyles,
  frameArtworkInset,
  frameContentRatio,
  framedMediaShadow,
} from "./frameStyles"

const pct = (fraction: number) => `${fraction * 100}%`

type SizeProps =
  | { boxSize: BoxProps["boxSize"]; width?: never; height?: never }
  | { boxSize?: never; width?: never; height: BoxProps["height"] }

type Props = SizeProps & {
  imageUrl: string
  artworkFrame: ArtworkFrame
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
 * needs a consistent square column.
 */
export default function FramedArtwork({
  imageUrl,
  artworkFrame,
  alt = "",
  idPrefix,
  flexShrink = 0,
  squareSlot = false,
  ...size
}: Props) {
  const frame = parseArtworkFrame(artworkFrame) ?? artworkFrame
  const isDieCut = frame === "die-cut-jacket"
  const ratio = frameContentRatio(frame)
  const inset = frameArtworkInset(frame)
  const height = "boxSize" in size && size.boxSize != null ? size.boxSize : size.height
  const slotSize =
    "boxSize" in size && size.boxSize != null ? { boxSize: size.boxSize } : { w: height, h: height }

  const contentRef = useRef<HTMLDivElement>(null)
  const [contentSize, setContentSize] = useState<ArtworkOverlaySize>()

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
          src={imageUrl}
          alt={alt}
          borderRadius={0}
          objectFit="cover"
          objectPosition="center"
          loading="lazy"
          maxW="none"
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
