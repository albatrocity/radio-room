import { defineSlotRecipe } from "@chakra-ui/react"
import { drawerAnatomy } from "@chakra-ui/react/anatomy"
import {
  overlayCloseTrigger,
  overlayBackdropFill,
  overlayFlushBottomContent,
  OVERLAY_BOTTOM_INSET,
} from "./overlayChrome"

/**
 * Extends Chakra’s default drawer recipe (deep-merged). Inset flush edges and
 * keep close in-flow so it is not painted under iOS standalone chrome.
 */
export const drawerRecipe = defineSlotRecipe({
  className: "chakra-drawer",
  slots: drawerAnatomy.keys(),
  base: {
    positioner: {
      paddingInlineStart: "var(--safe-area-left)",
      paddingInlineEnd: "var(--safe-area-right)",
      boxSizing: "border-box",
    },
    backdrop: overlayBackdropFill,
    content: {
      maxH: "100%",
      boxSizing: "border-box",
    },
    body: {
      minH: 0,
    },
    footer: {
      flexShrink: 0,
    },
    closeTrigger: {
      ...overlayCloseTrigger,
      pos: "relative",
      top: "auto",
      insetEnd: "auto",
      flexShrink: 0,
    },
  },
  variants: {
    placement: {
      start: {
        content: {
          paddingTop: "var(--safe-area-top)",
          paddingBottom: OVERLAY_BOTTOM_INSET,
        },
      },
      end: {
        content: {
          paddingTop: "var(--safe-area-top)",
          paddingBottom: OVERLAY_BOTTOM_INSET,
        },
      },
      top: {
        content: {
          paddingTop: "var(--safe-area-top)",
        },
      },
      bottom: {
        content: overlayFlushBottomContent,
      },
    },
    size: {
      full: {
        content: {
          h: "100%",
          maxH: "100%",
          paddingTop: "var(--safe-area-top)",
          paddingBottom: OVERLAY_BOTTOM_INSET,
        },
      },
    },
    contained: {
      true: {
        positioner: {
          paddingTop: "calc(var(--safe-area-top) + var(--chakra-spacing-4))",
          paddingInlineEnd: "calc(var(--safe-area-right) + var(--chakra-spacing-4))",
          paddingBottom: `calc(${OVERLAY_BOTTOM_INSET} + var(--chakra-spacing-4))`,
          paddingInlineStart: "calc(var(--safe-area-left) + var(--chakra-spacing-4))",
        },
      },
    },
  },
})
