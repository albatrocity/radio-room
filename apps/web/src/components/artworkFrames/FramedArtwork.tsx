import { useLayoutEffect, useRef, useState } from "react"
import { Box, Image, type BoxProps } from "@chakra-ui/react"
import type { ArtworkFrame } from "@repo/types"
import ArtworkFrameOverlay from "./ArtworkFrameOverlay"
import {
  ArtworkOverlaySizeContext,
  type ArtworkOverlaySize,
} from "./ArtworkOverlaySizeContext"
import { dieCutMaskStyles, frameArtworkInset, frameContentRatio } from "./frameStyles"

const pct = (fraction: number) => `${fraction * 100}%`

type SizeProps =
  | { boxSize: BoxProps["boxSize"]; width?: never; height?: never }
  | { boxSize?: never; width: BoxProps["width"]; height: BoxProps["height"] }

type Props = SizeProps & {
  imageUrl: string
  artworkFrame: ArtworkFrame
  alt?: string
  idPrefix?: string
  flexShrink?: BoxProps["flexShrink"]
}

/**
 * Cover art with a Physical Media overlay. Square corners; cassettes crop to a
 * portrait case and die-cut jackets punch a real hole through the wrapper via CSS mask.
 */
export default function FramedArtwork({
  imageUrl,
  artworkFrame,
  alt = "",
  idPrefix,
  flexShrink = 0,
  ...size
}: Props) {
  const isDieCut = artworkFrame === "die-cut-jacket"
  const ratio = frameContentRatio(artworkFrame)
  const inset = frameArtworkInset(artworkFrame)
  const sizeProps =
    "boxSize" in size && size.boxSize != null
      ? { boxSize: size.boxSize }
      : { w: size.width, h: size.height }

  const contentRef = useRef<HTMLDivElement>(null)
  const [contentSize, setContentSize] = useState<ArtworkOverlaySize>()

  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el) return

    const sync = () => {
      const { width, height } = el.getBoundingClientRect()
      if (width > 0 && height > 0) {
        setContentSize({ width: Math.round(width), height: Math.round(height) })
      }
    }

    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <ArtworkOverlaySizeContext.Provider value={contentSize}>
      <Box
        position="relative"
        display="flex"
        alignItems="center"
        justifyContent="center"
        flexShrink={flexShrink}
        {...sizeProps}
      >
        <Box
          ref={contentRef}
          position="relative"
          w={pct(ratio.width)}
          h={pct(ratio.height)}
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
          />
          <ArtworkFrameOverlay frame={artworkFrame} idPrefix={idPrefix} />
        </Box>
      </Box>
    </ArtworkOverlaySizeContext.Provider>
  )
}
