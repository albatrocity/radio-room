type Rect = { x: number; y: number; width: number; height: number }

type CrackPoint = readonly [number, number]

/**
 * One fracture running from the top-right corner down to the bottom-left, in
 * fractional coordinates of the plastic face it is drawn on. `good` stops after
 * `GOOD_POINTS` (a corner chip); `poor` runs the whole length. Sharing one spine
 * is what makes a Poor case read as "the Good crack, spread" rather than a
 * different break.
 */
const CRACK_SPINE: readonly CrackPoint[] = [
  [1, 0.006],
  [0.931, 0.073],
  [0.897, 0.086],
  [0.849, 0.147],
  [0.788, 0.202],
  [0.701, 0.297],
  [0.664, 0.348],
  [0.601, 0.401],
  [0.544, 0.499],
  [0.471, 0.546],
  [0.419, 0.627],
  [0.331, 0.684],
  [0.279, 0.776],
  [0.184, 0.827],
  [0.101, 0.914],
  [0.018, 0.968],
]

const GOOD_POINTS = 4

/** Splinters forking off the spine; kept off compact renders (they read as noise). */
const CRACK_BRANCHES: readonly { from: number; to: CrackPoint }[] = [
  { from: 1, to: [0.902, 0.148] },
  { from: 5, to: [0.735, 0.398] },
  { from: 9, to: [0.397, 0.531] },
  { from: 12, to: [0.203, 0.897] },
]

function toPath(points: readonly CrackPoint[], rect: Rect): string {
  return points
    .map(([fx, fy], i) => {
      const x = rect.x + fx * rect.width
      const y = rect.y + fy * rect.height
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(" ")
}

type Props = {
  /** Plastic face the crack travels across, in the overlay's own units. */
  rect: Rect
  severity: "good" | "poor"
  /** Row/track sizes: single-pass stroke, no splinters or shadow. */
  compact?: boolean
  /** Unique id for the clip that keeps the stroke inside the case. */
  idPrefix: string
}

/**
 * A crack in clear jewel-case plastic. Not a photoreal fracture — a white line
 * with just enough depth (offset shadow under, bright core over) to read as
 * broken plastic rather than a drawn stroke. Three `<path>`s, no filters, so it
 * costs the same at every size.
 */
export default function JewelCaseCrack({ rect, severity, compact = false, idPrefix }: Props) {
  const clipId = `${idPrefix}-crackClip`
  const points = severity === "poor" ? CRACK_SPINE : CRACK_SPINE.slice(0, GOOD_POINTS)
  const unit = Math.min(rect.width, rect.height) / 100
  const spine = toPath(points, rect)

  const branches = compact
    ? []
    : CRACK_BRANCHES.filter(({ from }) => from < points.length - 1).map(({ from, to }) =>
        toPath([CRACK_SPINE[from], to], rect),
      )

  // Compact loses the shadow pass, so the single white stroke carries the whole
  // crack and has to be thicker to survive a 48px thumbnail.
  const shadowWidth = unit * 0.72
  const bodyWidth = unit * (compact ? 0.9 : 0.46)
  const coreWidth = unit * 0.18

  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="miter" clipPath={`url(#${clipId})`}>
      {/* The crack starts on the corner itself, so half its stroke would hang
          outside the case without this. */}
      <clipPath id={clipId}>
        <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} />
      </clipPath>
      {!compact && (
        <g transform={`translate(${(unit * 0.4).toFixed(2)} ${(unit * 0.4).toFixed(2)})`}>
          <path d={spine} stroke="#000" strokeOpacity="0.3" strokeWidth={shadowWidth} />
          {branches.map((d) => (
            <path key={d} d={d} stroke="#000" strokeOpacity="0.22" strokeWidth={shadowWidth * 0.6} />
          ))}
        </g>
      )}

      <path d={spine} stroke="#fff" strokeOpacity="0.74" strokeWidth={bodyWidth} />
      {branches.map((d) => (
        <path key={d} d={d} stroke="#fff" strokeOpacity="0.5" strokeWidth={bodyWidth * 0.6} />
      ))}

      {!compact && <path d={spine} stroke="#fff" strokeOpacity="0.95" strokeWidth={coreWidth} />}
    </g>
  )
}
