import { Box, Image } from "@chakra-ui/react"
import type { ItemRarity } from "@repo/types"
import { getItemRarityColorPalette, itemRarityIconColor } from "../lib/itemRarityPalette"
import { getIcon } from "./PluginComponents/icons"
import { SvgIcon } from "./ui/svg-icon"

type Props = {
  /** Artwork URL (e.g. Physical Media cover art); wins over `icon`. */
  imageUrl?: string
  icon?: string
  rarity?: ItemRarity
  /** Chakra box size token for both the image and the icon glyph. */
  boxSize?: number
  alt?: string
}

/**
 * Leading visual for an item row: cover artwork when the item has some,
 * otherwise its Lucide glyph tinted by rarity.
 */
export default function ItemArtwork({ imageUrl, icon, rarity, boxSize = 7, alt = "" }: Props) {
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
