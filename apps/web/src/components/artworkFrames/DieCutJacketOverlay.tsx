import type { MediaCondition } from "@repo/types"
import OverlaySvg from "./OverlaySvg"
import RecordJacketOverlay from "./RecordJacketOverlay"

type Props = {
  idPrefix?: string
  /** Passed straight through — a 45 sleeve is cardboard, so it wears like an LP (ADR 0157). */
  condition?: MediaCondition
}

/** 45 picture sleeve: jacket wear plus paper-edge ring at the die-cut hole. Hole itself is the wrapper mask. */
export default function DieCutJacketOverlay({ idPrefix = "dc", condition = "mint" }: Props) {
  return (
    <>
      <RecordJacketOverlay idPrefix={`${idPrefix}-rj`} condition={condition} />
      <OverlaySvg>
        <circle
          cx="50"
          cy="50"
          r="20"
          fill="none"
          stroke="#000"
          strokeOpacity="0.55"
          strokeWidth="2.5"
        />
        <circle
          cx="50"
          cy="50"
          r="19"
          fill="none"
          stroke="#fff"
          strokeOpacity="0.12"
          strokeWidth="0.8"
        />
        <circle cx="50" cy="50" r="17" fill="none" stroke="#000" strokeOpacity="0.25" strokeWidth="1" />
        <circle
          cx="50"
          cy="50"
          r="21"
          fill="none"
          stroke="#fff"
          strokeOpacity="0.08"
          strokeWidth="0.6"
          strokeDasharray="1 2"
        />
      </OverlaySvg>
    </>
  )
}
