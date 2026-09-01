import type { SystemStyleObject } from "@chakra-ui/react"

/**
 * Home indicator, or the software keyboard while a text field is focused.
 * `--keyboard-inset` is synced from visualViewport in syncAppHeight (0 otherwise
 * so the URL bar does not lift overlays).
 */
export const OVERLAY_BOTTOM_INSET =
  "max(var(--safe-area-bottom), var(--keyboard-inset, 0px))"

/** Stretch the dimmer to the large viewport; visual viewport is short on iOS PWAs. */
export const overlayBackdropFill: SystemStyleObject = {
  "@media (display-mode: standalone), (display-mode: fullscreen)": {
    top: 0,
    bottom: "auto",
    minHeight: "100lvh",
    height: "100lvh",
  },
}

/** Portaled overlays skip layout fill padding; inset with the CSS vars from layout.css. */
export const overlayPositionerSafeArea: SystemStyleObject = {
  paddingTop: "var(--safe-area-top)",
  paddingInlineEnd: "var(--safe-area-right)",
  paddingBottom: OVERLAY_BOTTOM_INSET,
  paddingInlineStart: "var(--safe-area-left)",
  boxSizing: "border-box",
}

/** Sheet background goes to the screen edge; pad inner content for the home indicator / keyboard. */
export const overlayFlushBottomContent: SystemStyleObject = {
  paddingBottom: OVERLAY_BOTTOM_INSET,
  boxSizing: "border-box",
}

/** Apple HIG minimum tap target for overlay close controls. */
export const overlayCloseTrigger: SystemStyleObject = {
  minW: "44px",
  minH: "44px",
  w: "44px",
  h: "44px",
}
