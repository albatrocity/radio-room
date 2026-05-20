import * as React from "react"
import { ScrollArea, type SystemStyleObject } from "@chakra-ui/react"

type ScrollShadowOrientation = "vertical" | "horizontal"

type ScrollShadowViewportProps = React.ComponentPropsWithoutRef<
  typeof ScrollArea.Viewport
> & {
  /** Scroll axis for edge fade masks. Defaults to vertical. */
  orientation?: ScrollShadowOrientation
}

const scrollShadowBase: SystemStyleObject = {
  "--scroll-shadow-size": "6rem",
  maskImage: "linear-gradient(#000, #000)",
}

const verticalScrollShadow: SystemStyleObject = {
  "&[data-overflow-y]": {
    maskImage:
      "linear-gradient(#000,#000,transparent 0,#000 var(--scroll-shadow-size),#000 calc(100% - var(--scroll-shadow-size)),transparent)",
    "&[data-at-top]": {
      maskImage:
        "linear-gradient(180deg,#000 calc(100% - var(--scroll-shadow-size)),transparent)",
    },
    "&[data-at-bottom]": {
      maskImage:
        "linear-gradient(0deg,#000 calc(100% - var(--scroll-shadow-size)),transparent)",
    },
  },
  overscrollBehaviorY: "none",
}

const horizontalScrollShadow: SystemStyleObject = {
  "&[data-overflow-x]": {
    maskImage:
      "linear-gradient(90deg,#000,#000,transparent 0,#000 var(--scroll-shadow-size),#000 calc(100% - var(--scroll-shadow-size)),transparent)",
    "&[data-at-left]": {
      maskImage:
        "linear-gradient(90deg,#000 calc(100% - var(--scroll-shadow-size)),transparent)",
    },
    "&[data-at-right]": {
      maskImage:
        "linear-gradient(270deg,#000 calc(100% - var(--scroll-shadow-size)),transparent)",
    },
  },
  overscrollBehaviorX: "none",
}

const scrollShadowByOrientation: Record<ScrollShadowOrientation, SystemStyleObject> = {
  vertical: verticalScrollShadow,
  horizontal: horizontalScrollShadow,
}

const ScrollShadowViewport = React.forwardRef<
  React.ElementRef<typeof ScrollArea.Viewport>,
  ScrollShadowViewportProps
>(function ScrollShadowViewport({ children, orientation = "vertical", css, ...props }, ref) {
  return (
    <ScrollArea.Viewport
      ref={ref}
      css={{
        ...scrollShadowBase,
        ...scrollShadowByOrientation[orientation],
        ...css,
      }}
      {...props}
    >
      {children}
    </ScrollArea.Viewport>
  )
})

ScrollShadowViewport.displayName = "ScrollShadowViewport"

export default ScrollShadowViewport
