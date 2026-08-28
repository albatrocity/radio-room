import { defineSlotRecipe } from "@chakra-ui/react"
import { dialogAnatomy } from "@chakra-ui/react/anatomy"
import { overlayCloseTrigger, overlayBackdropFill, overlayFlushBottomContent, overlayPositionerSafeArea } from "./overlayChrome"

/**
 * Extends Chakra’s default dialog recipe (deep-merged). New Dialogs inherit
 * standalone-PWA safe-area inset without per-call-site CSS.
 */
export const dialogRecipe = defineSlotRecipe({
  className: "chakra-dialog",
  slots: dialogAnatomy.keys(),
  base: {
    positioner: overlayPositionerSafeArea,
    backdrop: overlayBackdropFill,
    header: {
      pe: "14",
    },
    closeTrigger: overlayCloseTrigger,
  },
  variants: {
    placement: {
      bottom: {
        positioner: {
          paddingBottom: 0,
        },
        content: overlayFlushBottomContent,
      },
    },
    size: {
      cover: {
        positioner: {
          paddingTop: "calc(var(--safe-area-top) + var(--chakra-spacing-10))",
          paddingInlineEnd: "calc(var(--safe-area-right) + var(--chakra-spacing-10))",
          paddingBottom: "calc(var(--safe-area-bottom) + var(--chakra-spacing-10))",
          paddingInlineStart: "calc(var(--safe-area-left) + var(--chakra-spacing-10))",
        },
      },
      full: {
        positioner: {
          alignItems: "stretch !important",
          justifyContent: "stretch !important",
        },
        content: {
          width: "100%",
          height: "100%",
          maxW: "100%",
          maxH: "100%",
          minH: "0",
          "--dialog-margin": "0",
          borderRadius: "0",
        },
      },
    },
  },
})
