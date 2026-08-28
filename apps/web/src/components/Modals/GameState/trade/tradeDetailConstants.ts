import { css, keyframes } from "@emotion/react"
import { FRAMED_ARTWORK_BOX_SIZE } from "../../../artworkFrames/frameStyles"

export const OFFER_ARTWORK_SIZE = 6
export const PICKER_ARTWORK_SIZE = FRAMED_ARTWORK_BOX_SIZE
/** Tall enough for square row art plus chip padding. */
export const PICKER_ROW_H = "4.25rem"
export const PICKER_ROW_GAP = "0.25rem"
export const TYPING_IDLE_MS = 1500

/** Unique name — Chakra/Panda also define `@keyframes pulse` as an opacity fade. */
const kfConfirmPulse = keyframes`
  from, to {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
`

export const confirmPulseAnim = css`
  animation: ${kfConfirmPulse} 1s ease-in-out infinite;
  display: inline-flex;
  transform-origin: center;
  will-change: transform;
`

export function pickerStripHeight(rows: number): string {
  if (rows <= 1) return PICKER_ROW_H
  return `calc(${rows} * ${PICKER_ROW_H} + ${rows - 1} * ${PICKER_ROW_GAP})`
}
