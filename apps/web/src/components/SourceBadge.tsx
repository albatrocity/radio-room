import { Badge, type BadgeProps } from "@chakra-ui/react"
import { labelForMetadataSource } from "@repo/types"

type Props = BadgeProps & {
  source: string
}

/**
 * Metadata-source chip ("Spotify", "Local", …) on a track row.
 *
 * A row shows it in one of two places depending on width, so callers pass the
 * responsive visibility they need (`hideFrom` / `hideBelow`) rather than each
 * placement rebuilding the badge.
 */
export function SourceBadge({ source, ...badgeProps }: Props) {
  return (
    <Badge size="sm" variant="subtle" flexShrink={0} {...badgeProps}>
      {labelForMetadataSource(source)}
    </Badge>
  )
}
