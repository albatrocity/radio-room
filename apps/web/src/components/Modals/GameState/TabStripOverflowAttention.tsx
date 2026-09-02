import { useLayoutEffect, useMemo, useState } from "react"
import { Box, Status } from "@chakra-ui/react"
import {
  clippedSidesForUnseenTabs,
  nearestClippedUnseenTab,
  type ClippedSides,
} from "../../../lib/tabStripOverflowAttention"

type OverflowSide = "left" | "right"

const EMPTY: ClippedSides = { left: false, right: false }

function tabValue(el: Element): string | null {
  return el.getAttribute("data-value") ?? el.getAttribute("value")
}

function collectTabRects(viewport: HTMLElement) {
  return Array.from(viewport.querySelectorAll<HTMLElement>('[role="tab"]')).map(
    (tab, index) => ({
      value: tabValue(tab) ?? "",
      rect: tab.getBoundingClientRect(),
      index,
      el: tab,
    }),
  )
}

function scrollTabIntoView(viewport: HTMLElement, tab: HTMLElement, side: OverflowSide): void {
  const vRect = viewport.getBoundingClientRect()
  const tRect = tab.getBoundingClientRect()
  const delta =
    side === "left" ? tRect.left - vRect.left : tRect.right - vRect.right
  viewport.scrollBy({ left: delta, behavior: "smooth" })
}

export type TabStripOverflowAttentionProps = {
  /** Horizontal scroll viewport (ScrollShadowViewport / ScrollArea.Viewport). */
  viewport: HTMLElement | null
  /** Tab `value`s that currently have an attention indicator. */
  unseenTabValues: ReadonlySet<string>
}

/**
 * Edge Status dots outside the horizontal fade mask when an unseen tab is
 * scrolled out of view. Click scrolls the nearest unseen tab into view.
 */
export function TabStripOverflowAttention({
  viewport,
  unseenTabValues,
}: TabStripOverflowAttentionProps) {
  const [clipped, setClipped] = useState<ClippedSides>(EMPTY)
  const unseenKey = useMemo(
    () => Array.from(unseenTabValues).sort().join("\0"),
    [unseenTabValues],
  )

  useLayoutEffect(() => {
    if (!viewport || unseenTabValues.size === 0) {
      setClipped((prev) => (prev.left || prev.right ? EMPTY : prev))
      return
    }

    const measure = () => {
      const tabs = collectTabRects(viewport)
      const next = clippedSidesForUnseenTabs(
        viewport.getBoundingClientRect(),
        tabs.map(({ value, rect }) => ({ value, rect })),
        unseenTabValues,
      )
      setClipped((prev) =>
        prev.left === next.left && prev.right === next.right ? prev : next,
      )
    }

    measure()

    const io = new IntersectionObserver(measure, {
      root: viewport,
      threshold: [0, 0.25, 0.5, 0.75, 1],
    })
    for (const tab of viewport.querySelectorAll<HTMLElement>('[role="tab"]')) {
      const value = tabValue(tab)
      if (value && unseenTabValues.has(value)) io.observe(tab)
    }

    const ro = new ResizeObserver(measure)
    ro.observe(viewport)
    const list = viewport.querySelector('[role="tablist"]')
    if (list) ro.observe(list)

    return () => {
      io.disconnect()
      ro.disconnect()
    }
  }, [viewport, unseenTabValues, unseenKey])

  const onEdgeClick = (side: OverflowSide) => {
    if (!viewport) return
    const tabs = collectTabRects(viewport)
    const index = nearestClippedUnseenTab(
      viewport.getBoundingClientRect(),
      tabs,
      unseenTabValues,
      side,
    )
    if (index == null) return
    const tab = tabs[index]?.el
    if (tab) scrollTabIntoView(viewport, tab, side)
  }

  if (!clipped.left && !clipped.right) return null

  return (
    <>
      {clipped.left ? (
        <OverflowEdgeButton side="left" onClick={() => onEdgeClick("left")} />
      ) : null}
      {clipped.right ? (
        <OverflowEdgeButton side="right" onClick={() => onEdgeClick("right")} />
      ) : null}
    </>
  )
}

function OverflowEdgeButton({
  side,
  onClick,
}: {
  side: OverflowSide
  onClick: () => void
}) {
  return (
    <Box
      as="button"
      aria-label={
        side === "left"
          ? "Unread notification on a tab to the left"
          : "Unread notification on a tab to the right"
      }
      title="Notification on another tab"
      onClick={onClick}
      position="absolute"
      top="0"
      bottom="0"
      left={side === "left" ? 0 : undefined}
      right={side === "right" ? 0 : undefined}
      width="1.75rem"
      zIndex={2}
      display="flex"
      alignItems="flex-start"
      justifyContent="center"
      pt={1}
      cursor="pointer"
      css={{
        background:
          side === "left"
            ? "linear-gradient(90deg, var(--chakra-colors-bg) 40%, transparent)"
            : "linear-gradient(270deg, var(--chakra-colors-bg) 40%, transparent)",
      }}
      _hover={{ opacity: 0.9 }}
    >
      <Status.Root size="sm" colorPalette="primary" pointerEvents="none">
        <Status.Indicator />
      </Status.Root>
    </Box>
  )
}
