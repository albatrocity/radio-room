import type { ArtworkFrame, MediaCondition } from "@repo/types"
import CassetteCaseOverlay from "./CassetteCaseOverlay"
import DieCutJacketOverlay from "./DieCutJacketOverlay"
import JewelCaseOverlay from "./JewelCaseOverlay"
import RecordJacketOverlay from "./RecordJacketOverlay"

type Props = {
  frame: ArtworkFrame
  /** Stable prefix for SVG def ids when multiple overlays mount on one page. */
  idPrefix?: string
  /** Jewel case without a booklet cover (hand-lettered disc visible). */
  coverless?: boolean
  /**
   * Physical Media wear (ADR 0157). Orthogonal to `frame`: the object is the
   * same object, so condition modulates the overlay rather than selecting a
   * different one. Defaults to `mint`, matching `readItemCondition` for stacks
   * with no condition metadata.
   */
  condition?: MediaCondition
}

export default function ArtworkFrameOverlay({
  frame,
  idPrefix = "af",
  coverless = false,
  condition = "mint",
}: Props) {
  switch (frame) {
    case "jewel-case":
      return (
        <JewelCaseOverlay idPrefix={`${idPrefix}-jc`} coverless={coverless} condition={condition} />
      )
    case "record-jacket":
      return <RecordJacketOverlay idPrefix={`${idPrefix}-rj`} condition={condition} />
    case "die-cut-jacket":
      return <DieCutJacketOverlay idPrefix={`${idPrefix}-dc`} condition={condition} />
    case "cassette-case":
      return <CassetteCaseOverlay idPrefix={`${idPrefix}-cc`} condition={condition} />
    default: {
      const _exhaustive: never = frame
      return _exhaustive
    }
  }
}
