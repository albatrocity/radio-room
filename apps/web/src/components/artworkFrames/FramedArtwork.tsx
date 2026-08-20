import { useEffect, useRef, useState } from "react"
import { Box, Image, type BoxProps } from "@chakra-ui/react"
import { parseArtworkFrame } from "@repo/types"
import type { PhysicalMediaArt } from "../../lib/physicalMediaArtwork"
import ArtworkFrameOverlay from "./ArtworkFrameOverlay"
import JewelCaseUnderlay from "./JewelCaseUnderlay"
import {
  dieCutMaskStyles,
  frameArtworkInset,
  frameContentRatio,
  framedArtworkLayout,
  framedMediaShadow,
  type ArtworkSizePreset,
} from "./frameStyles"

const pct = (fraction: number) => `${fraction * 100}%`

function srcForSize(art: PhysicalMediaArt, size: ArtworkSizePreset): string | undefined {
  if (!art.imageUrl?.trim()) return undefined
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
 * sleeves, landscape for jewel cases (spine) and portrait for cassettes. Pass
 * `squareSlot` when a list needs a consistent square column. `size` picks layout
 * and which cover variant to load (`feature` prefers `imageUrlLarge`).
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
  const isJewelCase = frame === "jewel-case"
  const hasCover = Boolean(art.imageUrl?.trim())
  const ratio = frameContentRatio(frame)
  const inset = frameArtworkInset(frame)
  const layout = framedArtworkLayout(size)
  const height = layout.boxSize ?? layout.height
  const width = layout.width
  const slotSize =
    layout.boxSize != null
      ? { boxSize: layout.boxSize }
      : width != null
        ? { w: width, aspectRatio: "1 / 1" }
        : { w: height, h: height }
  const displayUrl = srcForSize(art, size)
  const fallbackImageUrl = art.fallbackImageUrl

  const contentRef = useRef<HTMLDivElement>(null)
  const [src, setSrc] = useState(displayUrl)

  useEffect(() => {
    setSrc(displayUrl)
  }, [displayUrl])

  // A jewel case is wider than it is tall, so a square slot has to constrain it
  // by width; sizing by height would push the spine outside the slot. Portrait
  // frames (cassettes) do the opposite — constrain by height so they don't grow
  // taller than the square when `feature` also supplies `width: "100%"`.
  const widerThanTall = ratio.width > ratio.height
  const isFeatureMode = size === "feature"

  const fillParent = isFeatureMode && !squareSlot

  const object = (
    <Box
      position="relative"
      display={fillParent ? "block" : "inline-block"}
      flexShrink={squareSlot ? undefined : flexShrink}
      h={
        fillParent
          ? "100%"
          : squareSlot
            ? widerThanTall
              ? "auto"
              : "100%"
            : width
              ? "auto"
              : height
      }
      w={
        squareSlot
          ? widerThanTall
            ? "100%"
            : "auto"
          : (width ?? "auto")
      }
      maxW={isFeatureMode || squareSlot ? "100%" : undefined}
      maxH={isFeatureMode || squareSlot ? "100%" : undefined}
      aspectRatio={fillParent ? undefined : `${ratio.width} / ${ratio.height}`}
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
        overflow={isJewelCase ? "visible" : "hidden"}
        {...(isDieCut ? dieCutMaskStyles : {})}
      >
        {isJewelCase && (
          <Box position="absolute" inset={0} zIndex={0} pointerEvents="none">
            <JewelCaseUnderlay
              idPrefix={idPrefix ? `${idPrefix}-jc` : "jc"}
              label={art.discLabel}
            />
          </Box>
        )}
        {src && (
          <Image
            position="absolute"
            top={pct(inset.top)}
            left={pct(inset.left)}
            w={pct(1 - inset.left - inset.right)}
            h={pct(1 - inset.top - inset.bottom)}
            zIndex={1}
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
        )}
        <Box position="absolute" inset={0} zIndex={2} pointerEvents="none">
          <ArtworkFrameOverlay frame={frame} idPrefix={idPrefix} coverless={!hasCover} />
        </Box>
      </Box>
    </Box>
  )

  return squareSlot ? (
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
  )
}
