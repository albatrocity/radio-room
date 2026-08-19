import type { ArtworkFrame } from "@repo/types"
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
}

export default function ArtworkFrameOverlay({ frame, idPrefix = "af", coverless = false }: Props) {
  switch (frame) {
    case "jewel-case":
      return <JewelCaseOverlay idPrefix={`${idPrefix}-jc`} coverless={coverless} />
    case "record-jacket":
      return <RecordJacketOverlay idPrefix={`${idPrefix}-rj`} />
    case "die-cut-jacket":
      return <DieCutJacketOverlay idPrefix={`${idPrefix}-dc`} />
    case "cassette-case":
      return <CassetteCaseOverlay idPrefix={`${idPrefix}-cc`} />
    default: {
      const _exhaustive: never = frame
      return _exhaustive
    }
  }
}
