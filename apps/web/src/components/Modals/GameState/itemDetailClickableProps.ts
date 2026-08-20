import type { KeyboardEvent, MouseEvent } from "react"
import type { ItemDetailView } from "@repo/types"

type ClickableProps = {
  cursor: "pointer"
  role: "button"
  tabIndex: 0
  "aria-label": string
  onClick: (event: MouseEvent) => void
  onKeyDown: (event: KeyboardEvent) => void
  _hover: { opacity: number }
}

/**
 * Turns an item row's name/description block into a second way to open the
 * detail view (ADR 0104), spread onto the Chakra element wrapping that text.
 *
 * Returns `{}` when the item has no detail view, so the block stays plain text
 * with no button semantics. Clicks that land on a link inside a linkified
 * description belong to the link, not the row.
 */
export function itemDetailClickableProps(params: {
  detailView?: ItemDetailView
  /** Item name, for the fallback accessible label. */
  name: string
  onOpen?: () => void
}): ClickableProps | Record<string, never> {
  const { detailView, name, onOpen } = params
  if (!detailView || !onOpen) return {}

  return {
    cursor: "pointer",
    role: "button",
    tabIndex: 0,
    "aria-label": detailView.actionLabel ?? `View details for ${name}`,
    onClick: (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest("a")) return
      onOpen()
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return
      event.preventDefault()
      onOpen()
    },
    _hover: { opacity: 0.9 },
  }
}
