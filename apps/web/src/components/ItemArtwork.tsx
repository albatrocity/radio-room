import { useState } from "react"
import { Box, Image } from "@chakra-ui/react"
import type { ArtworkFrame, ItemRarity } from "@repo/types"
import { getItemRarityColorPalette, itemRarityIconColor } from "../lib/itemRarityPalette"
import { toPhysicalMediaArt } from "../lib/physicalMediaArtwork"
import { ArtworkPreviewDialog } from "./ArtworkPreviewDialog"
import { getIcon } from "./PluginComponents/icons"
import { SvgIcon } from "./ui/svg-icon"
import FramedArtwork from "./artworkFrames/FramedArtwork"

type Props = {
  /** Artwork URL (e.g. Physical Media cover art); wins over `icon`. */
  imageUrl?: string
  imageUrlLarge?: string
  icon?: string
  rarity?: ItemRarity
  /** Chakra box size token for both the image and the icon glyph. */
  boxSize?: number
  alt?: string
  /** Physical Media presentation overlay when cover art is present. */
  artworkFrame?: ArtworkFrame
}

/**
 * Leading visual for an item row: cover artwork when the item has some,
 * otherwise its Lucide glyph tinted by rarity. Framed covers open a
 * viewport-scaled preview on click.
 */
export default function ItemArtwork({
  imageUrl,
  imageUrlLarge,
  icon,
  rarity,
  boxSize = 7,
  alt = "",
  artworkFrame,
}: Props) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const art = toPhysicalMediaArt({ imageUrl, imageUrlLarge, artworkFrame, name: alt })
  if (art) {
    const label = alt.trim() ? `View artwork for ${alt.trim()}` : "View artwork"
    return (
      <>
        <Box
          asChild
          display="inline-flex"
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
              setPreviewOpen(true)
            }}
          >
            <FramedArtwork art={art} size="row" alt="" />
          </button>
        </Box>
        <ArtworkPreviewDialog
          art={art}
          alt={alt}
          open={previewOpen}
          onOpenChange={setPreviewOpen}
        />
      </>
    )
  }

  if (imageUrl) {
    return (
      <Image
        src={imageUrl}
        alt={alt}
        boxSize={boxSize}
        flexShrink={0}
        borderRadius="sm"
        objectFit="cover"
        loading="lazy"
      />
    )
  }

  const Glyph = icon ? getIcon(icon) : undefined
  if (!Glyph) {
    return <Box boxSize={boxSize} flexShrink={0} aria-hidden />
  }

  return (
    <Box
      flexShrink={0}
      colorPalette={rarity ? getItemRarityColorPalette(rarity) : undefined}
      display="inline-flex"
    >
      <SvgIcon
        icon={Glyph}
        boxSize={boxSize}
        color={rarity ? itemRarityIconColor : "fg.muted"}
        aria-hidden
      />
    </Box>
  )
}
