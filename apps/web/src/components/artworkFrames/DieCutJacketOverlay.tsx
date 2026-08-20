import OverlaySvg from "./OverlaySvg"
import RecordJacketOverlay from "./RecordJacketOverlay"

type Props = {
  idPrefix?: string
}

/** 45 picture sleeve: jacket wear plus paper-edge ring at the die-cut hole. Hole itself is the wrapper mask. */
export default function DieCutJacketOverlay({ idPrefix = "dc" }: Props) {
  return (
    <>
      <RecordJacketOverlay idPrefix={`${idPrefix}-rj`} />
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
