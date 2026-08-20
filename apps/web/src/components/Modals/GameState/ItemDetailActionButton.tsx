import { Button, Icon, IconButton } from "@chakra-ui/react"
import type { ItemDetailView } from "@repo/types"
import { getIcon } from "../../PluginComponents/icons"
import { Tooltip } from "../../ui/tooltip"

type Props = {
  detailView: ItemDetailView
  onClick: () => void
  size?: "xs" | "sm"
  variant?: "solid" | "outline"
}

/**
 * Secondary Details control for inventory / shop rows (ADR 0104).
 * `iconOnly` + `actionIcon` → IconButton with `actionLabel` tooltip.
 */
export function ItemDetailActionButton({
  detailView,
  onClick,
  size = "xs",
  variant = "solid",
}: Props) {
  const label = detailView.actionLabel ?? "Details"
  const ActionIcon = detailView.actionIcon ? getIcon(detailView.actionIcon) : undefined

  if (detailView.iconOnly && ActionIcon) {
    return (
      <Tooltip content={label}>
        <IconButton
          size={size}
          variant={variant}
          colorPalette="action"
          aria-label={label}
          onClick={onClick}
        >
          <Icon as={ActionIcon} boxSize="0.9rem" />
        </IconButton>
      </Tooltip>
    )
  }

  return (
    <Button size={size} variant={variant} colorPalette="action" onClick={onClick}>
      {ActionIcon ? <Icon as={ActionIcon} boxSize="0.9rem" /> : null}
      {label}
    </Button>
  )
}
