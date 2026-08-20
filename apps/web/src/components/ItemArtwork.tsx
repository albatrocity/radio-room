import { useState } from "react"
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
   * When set, framed artwork click calls this instead of opening the full-size
   * preview dialog (e.g. navigate to Game State item detail).
   */
  onClick?: () => void
}

/**
 * Leading visual for an item row: cover artwork when the item has some,
 * otherwise its Lucide glyph tinted by rarity. Framed covers open a
 * viewport-scaled preview on click unless `onClick` overrides that.
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
  onClick,
}: Props) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const fill = size === "feature"
  const art = toPhysicalMediaArt({ imageUrl, imageUrlLarge, artworkFrame, name: alt })
  if (art) {
    const label = onClick
      ? alt.trim()
        ? `View details for ${alt.trim()}`
        : "View details"
      : alt.trim()
      ? `View artwork for ${alt.trim()}`
      : "View artwork"
    return (
      <>
        <Box
          asChild
          display={fill ? "block" : "inline-flex"}
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
              if (onClick) {
                onClick()
                return
              }
              setPreviewOpen(true)
            }}
          >
            <FramedArtwork art={art} size={size} squareSlot={fill} alt="" />
          </button>
        </Box>
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
    return (
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
