import { useState, type ReactNode } from "react"
import { Box, Image } from "@chakra-ui/react"
import type { ArtworkFrame, ItemRarity } from "@repo/types"
import { getItemRarityColorPalette, itemRarityIconColor } from "../lib/itemRarityPalette"
import { toPhysicalMediaArt } from "../lib/physicalMediaArtwork"
import { ArtworkPreviewDialog } from "./ArtworkPreviewDialog"
import { getIcon } from "./PluginComponents/icons"
import { SvgIcon } from "./ui/svg-icon"
import FramedArtwork from "./artworkFrames/FramedArtwork"
import type { ArtworkSizePreset } from "./artworkFrames/frameStyles"

type Props = {
  /** Artwork URL (e.g. Physical Media cover art); wins over `icon`. */
  imageUrl?: string
  imageUrlLarge?: string
  icon?: string
  rarity?: ItemRarity
  /** Chakra box size token for both the image and the icon glyph. */
  boxSize?: number
  /**
   * Framed-art size. `feature` fills the parent width (square slot). Plain
   * image/icon use full width when `feature`, otherwise `boxSize`.
   */
  size?: ArtworkSizePreset
  alt?: string
  /** Physical Media presentation overlay when cover art is present. */
  artworkFrame?: ArtworkFrame
  /**
   * Open the full-size preview when an unframed cover is clicked. Framed
   * artwork is always previewable; plain covers opt in (album heroes, not rows).
   */
  previewable?: boolean
  /**
   * When set, artwork click calls this instead of opening the full-size
   * preview dialog (e.g. navigate to Game State item detail).
   */
  onClick?: () => void
  /**
   * When false, render a static image (no button / preview). Use when a parent
   * row is the click target so framed art does not nest a button.
   */
  interactive?: boolean
}

function artworkButtonLabel(alt: string, isDetailAction: boolean): string {
  const name = alt.trim()
  if (isDetailAction) return name ? `View details for ${name}` : "View details"
  return name ? `View artwork for ${name}` : "View artwork"
}

function ArtworkButton({
  label,
  fill,
  onClick,
  children,
}: {
  label: string
  fill: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Box
      asChild
      display={fill ? "block" : "inline-flex"}
      alignItems={fill ? undefined : "center"}
      w={fill ? "100%" : undefined}
      lineHeight="0"
      cursor="pointer"
      bg="transparent"
      border="none"
      p="0"
      _focusVisible={{
        outline: "2px solid",
        outlineColor: "colorPalette.focusRing",
        outlineOffset: "2px",
      }}
    >
      <button
        type="button"
        aria-label={label}
        onClick={(event) => {
          event.stopPropagation()
          onClick()
        }}
      >
        {children}
      </button>
    </Box>
  )
}

/**
 * Leading visual for an item row: cover artwork when the item has some,
 * otherwise its Lucide glyph tinted by rarity. Framed covers (and `previewable`
 * plain covers) open a viewport-scaled preview unless `onClick` overrides that.
 */
export default function ItemArtwork({
  imageUrl,
  imageUrlLarge,
  icon,
  rarity,
  boxSize = 7,
  size = "row",
  alt = "",
  artworkFrame,
  previewable = false,
  onClick,
  interactive = true,
}: Props) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const fill = size === "feature"
  const art = toPhysicalMediaArt({ imageUrl, imageUrlLarge, artworkFrame, name: alt })
  if (art) {
    const framed = <FramedArtwork art={art} size={size} squareSlot={fill} alt="" />
    if (!interactive) return framed
    return (
      <>
        <ArtworkButton
          label={artworkButtonLabel(alt, Boolean(onClick))}
          fill={fill}
          onClick={onClick ?? (() => setPreviewOpen(true))}
        >
          {framed}
        </ArtworkButton>
        {!onClick ? (
          <ArtworkPreviewDialog
            art={art}
            alt={alt}
            open={previewOpen}
            onOpenChange={setPreviewOpen}
          />
        ) : null}
      </>
    )
  }

  if (imageUrl) {
    const image = (
      <Image
        src={imageUrl}
        alt={alt}
        boxSize={fill ? undefined : boxSize}
        w={fill ? "100%" : undefined}
        aspectRatio={fill ? "1 / 1" : undefined}
        flexShrink={0}
        objectFit="cover"
        loading="lazy"
      />
    )

    if (!interactive || (!onClick && !previewable)) return image

    return (
      <>
        <ArtworkButton
          label={artworkButtonLabel(alt, Boolean(onClick))}
          fill={fill}
          onClick={onClick ?? (() => setPreviewOpen(true))}
        >
          {image}
        </ArtworkButton>
        {!onClick ? (
          <ArtworkPreviewDialog
            imageUrl={imageUrlLarge?.trim() || imageUrl}
            alt={alt}
            open={previewOpen}
            onOpenChange={setPreviewOpen}
          />
        ) : null}
      </>
    )
  }

  const Glyph = icon ? getIcon(icon) : undefined
  if (!Glyph) {
    return (
      <Box
        boxSize={fill ? undefined : boxSize}
        w={fill ? "100%" : undefined}
        aspectRatio={fill ? "1 / 1" : undefined}
        flexShrink={0}
        aria-hidden
      />
    )
  }

  return (
    <Box
      flexShrink={0}
      w={fill ? "100%" : undefined}
      colorPalette={rarity ? getItemRarityColorPalette(rarity) : undefined}
      display="inline-flex"
      justifyContent={fill ? "center" : undefined}
    >
      <SvgIcon
        icon={Glyph}
        boxSize={fill ? 24 : boxSize}
        color={rarity ? itemRarityIconColor : "fg.muted"}
        aria-hidden
      />
    </Box>
  )
}
