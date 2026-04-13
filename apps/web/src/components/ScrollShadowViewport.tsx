import * as React from "react"
import { ScrollArea } from "@chakra-ui/react"

type ScrollShadowViewportProps = React.ComponentPropsWithoutRef<typeof ScrollArea.Viewport>

const ScrollShadowViewport = React.forwardRef<
  React.ElementRef<typeof ScrollArea.Viewport>,
  ScrollShadowViewportProps
>(function ScrollShadowViewport({ children, ...props }, ref) {
  return (
    <ScrollArea.Viewport
      ref={ref}
      css={{
        "--scroll-shadow-size": "4rem",
        maskImage: "linear-gradient(#000, #000)",
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
      }}
      {...props}
    >
      {children}
    </ScrollArea.Viewport>
  )
})

ScrollShadowViewport.displayName = "ScrollShadowViewport"

export default ScrollShadowViewport
