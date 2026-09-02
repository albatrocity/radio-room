/** Pure geometry helpers for tab-strip overflow attention (node-testable). */

export type RectLike = { left: number; right: number }

export type ClippedSides = { left: boolean; right: boolean }

/**
 * Inset from the viewport edge when deciding if a tab badge is clipped.
 * 0 = badge must cross the hard clip edge (not the scroll fade).
 */
export const TAB_OVERFLOW_EDGE_PAD = 0

/** True when the tab’s right-edge badge is past the right clip edge. */
export function isTabBadgeObscuredRight(
  viewport: RectLike,
  tab: RectLike,
  pad: number = TAB_OVERFLOW_EDGE_PAD,
): boolean {
  return tab.right > viewport.right - pad
}

/** True when the tab’s right-edge badge is past the left clip edge. */
export function isTabBadgeObscuredLeft(
  viewport: RectLike,
  tab: RectLike,
  pad: number = TAB_OVERFLOW_EDGE_PAD,
): boolean {
  return tab.right < viewport.left + pad
}

export function clippedSidesForUnseenTabs(
  viewport: RectLike,
  tabRects: Array<{ value: string; rect: RectLike }>,
  unseenValues: ReadonlySet<string>,
  pad: number = TAB_OVERFLOW_EDGE_PAD,
): ClippedSides {
  if (unseenValues.size === 0) return { left: false, right: false }

  let left = false
  let right = false
  for (const { value, rect } of tabRects) {
    if (!unseenValues.has(value)) continue
    if (isTabBadgeObscuredLeft(viewport, rect, pad)) left = true
    else if (isTabBadgeObscuredRight(viewport, rect, pad)) right = true
  }
  return { left, right }
}

export function nearestClippedUnseenTab(
  viewport: RectLike,
  tabRects: Array<{ value: string; rect: RectLike; index: number }>,
  unseenValues: ReadonlySet<string>,
  side: "left" | "right",
  pad: number = TAB_OVERFLOW_EDGE_PAD,
): number | null {
  let bestIndex: number | null = null
  let bestDist = Infinity

  for (const { value, rect, index } of tabRects) {
    if (!unseenValues.has(value)) continue
    if (side === "left" && isTabBadgeObscuredLeft(viewport, rect, pad)) {
      const dist = viewport.left + pad - rect.right
      if (dist < bestDist) {
        bestDist = dist
        bestIndex = index
      }
    } else if (side === "right" && isTabBadgeObscuredRight(viewport, rect, pad)) {
      const dist = rect.right - (viewport.right - pad)
      if (dist < bestDist) {
        bestDist = dist
        bestIndex = index
      }
    }
  }

  return bestIndex
}
