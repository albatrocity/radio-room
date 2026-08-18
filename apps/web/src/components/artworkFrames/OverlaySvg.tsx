import type { ReactNode, SVGAttributes } from "react"
import { useArtworkOverlaySize } from "./ArtworkOverlaySizeContext"

type Props = SVGAttributes<SVGSVGElement> & {
  children: ReactNode
}

/** Full-bleed overlay SVG scaled to the artwork bounds (viewBox 0–100 unless overridden). */
export default function OverlaySvg({ children, style, ...rest }: Props) {
  const size = useArtworkOverlaySize()

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
      {...rest}
      style={{
        display: "block",
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
        // Explicit px beats Chakra recipes that size nested svg down to icon dimensions.
        maxWidth: "none",
        maxHeight: "none",
        ...(size ? { width: size.width, height: size.height } : { width: "100%", height: "100%" }),
        ...style,
      }}
    >
      {children}
    </svg>
  )
}
