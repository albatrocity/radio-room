import type { ArtworkFrame, InventoryItem, PhysicalMediaFormat } from "@repo/types"
import { formatFromArtworkFrame, PHYSICAL_MEDIA_FORMATS, PHYSICAL_MEDIA_ORIGIN_KEY } from "@repo/types"

export { formatFromArtworkFrame } from "@repo/types"
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

/** Reverse of BROKEN_MEDIA_BY_FORMAT: which formats a broken SKU can restore to. */
export const FORMATS_BY_BROKEN_SHORT_ID: Record<string, PhysicalMediaFormat[]> = (() => {
  const out: Record<string, PhysicalMediaFormat[]> = {}
  for (const format of PHYSICAL_MEDIA_FORMATS) {
    const shortId = BROKEN_MEDIA_BY_FORMAT[format].shortId
    const list = out[shortId] ?? []
    if (!list.includes(format)) list.push(format)
    out[shortId] = list
  }
  return out
})()

export function isBrokenMediaShortId(shortId: string | undefined): boolean {
  return (
    shortId != null && Object.prototype.hasOwnProperty.call(FORMATS_BY_BROKEN_SHORT_ID, shortId)
  )
}

export function readMediaOrigin(item: InventoryItem): string | undefined {
  const raw = item.metadata?.[PHYSICAL_MEDIA_ORIGIN_KEY]
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined
}

export function brokenMediaForRecord(params: {
  mediaFormat?: PhysicalMediaFormat
  artworkFrame?: ArtworkFrame | string
}): BrokenMediaSpec | undefined {
  const format = params.mediaFormat ?? formatFromArtworkFrame(params.artworkFrame)
  if (!format) return undefined
  return BROKEN_MEDIA_BY_FORMAT[format]
}
