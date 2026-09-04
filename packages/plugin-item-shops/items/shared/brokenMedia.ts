import type { ArtworkFrame, PhysicalMediaFormat } from "@repo/types"
import { parseArtworkFrame } from "@repo/types"
import { scratchedCd, scratchedCdTransitionMessage } from "../scratched-cd"
import { dustyRecord, dustyRecordTransitionMessage } from "../dusty-record"
import { tangledTape, tangledTapeTransitionMessage } from "../tangled-tape"

export type BrokenMediaSpec = {
  shortId: string
  transitionMessage: (recordName: string) => string
}

export const BROKEN_MEDIA_BY_FORMAT: Record<PhysicalMediaFormat, BrokenMediaSpec> = {
  CD: {
    shortId: scratchedCd.shortId,
    transitionMessage: scratchedCdTransitionMessage,
  },
  LP: {
    shortId: dustyRecord.shortId,
    transitionMessage: dustyRecordTransitionMessage,
  },
  "45": {
    shortId: dustyRecord.shortId,
    transitionMessage: dustyRecordTransitionMessage,
  },
  TAPE: {
    shortId: tangledTape.shortId,
    transitionMessage: tangledTapeTransitionMessage,
  },
}

/** 1:1 frame → format for records registered before `mediaFormat` existed. */
const FORMAT_BY_FRAME: Record<ArtworkFrame, PhysicalMediaFormat> = {
  "jewel-case": "CD",
  "record-jacket": "LP",
  "die-cut-jacket": "45",
  "cassette-case": "TAPE",
}

export function formatFromArtworkFrame(
  frame: ArtworkFrame | string | undefined,
): PhysicalMediaFormat | undefined {
  if (frame == null) return undefined
  const parsed = typeof frame === "string" ? parseArtworkFrame(frame) : frame
  if (!parsed) return undefined
  return FORMAT_BY_FRAME[parsed]
}

export function brokenMediaForRecord(params: {
  mediaFormat?: PhysicalMediaFormat
  artworkFrame?: ArtworkFrame | string
}): BrokenMediaSpec | undefined {
  const format = params.mediaFormat ?? formatFromArtworkFrame(params.artworkFrame)
  if (!format) return undefined
  return BROKEN_MEDIA_BY_FORMAT[format]
}
