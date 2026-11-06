import type { Poll } from "@repo/types/Poll"

/** Pull-off signs. The first option is the exit; the row layout puts it on the right. */
const PULL_OFF_FOOTNOTES = new Set(["No votes = pull off", "No votes = keep driving"])

/** Fixed footnotes on pull-off signs and junction votes. Incident choices use a different one. */
const PAIRED_POLL_FOOTNOTES = new Set([
  ...PULL_OFF_FOOTNOTES,
  "No votes = take it",
  "No votes = stay on the road",
])

/** Two-option pull-off and junction polls. Incident choices stay stacked. */
export function roadTripPairsOptions(poll: Poll): boolean {
  if (poll.options.length !== 2) return false
  if (poll.presentation?.eyebrow === "JUNCTION") return true
  return PAIRED_POLL_FOOTNOTES.has(poll.presentation?.footnote ?? "")
}

/** Pull-off rows read Keep driving, then Pull off. Junctions stay in option order. */
export function roadTripExitOnRight(poll: Poll): boolean {
  return poll.options.length === 2 && PULL_OFF_FOOTNOTES.has(poll.presentation?.footnote ?? "")
}
