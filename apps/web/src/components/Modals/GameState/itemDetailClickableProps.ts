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
 * Makes an item row (or its artwork+title block) open the detail view
 * (ADR 0104 / 0127). Spread onto the Chakra element that should act as the
 * button.
 *
 * Returns `{}` when there is no detail view or handler. Clicks that land on a
 * link or nested button belong to that control, not the row.
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
      if ((event.target as HTMLElement).closest("a, button")) return
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
