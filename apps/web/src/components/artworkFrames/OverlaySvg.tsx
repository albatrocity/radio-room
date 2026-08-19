import type { ReactNode, SVGAttributes } from "react"

type Props = SVGAttributes<SVGSVGElement> & {
  children: ReactNode
}

/** Full-bleed overlay SVG scaled to the artwork bounds (viewBox 0–100 unless overridden). */
export default function OverlaySvg({ children, style, ...rest }: Props) {
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
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        // Chakra recipes size nested svg down to icon dimensions; percentages keep
        // the overlay locked to the case even when the preview dialog resizes.
        maxWidth: "none",
        maxHeight: "none",
        ...style,
      }}
    >
      {children}
    </svg>
  )
}
