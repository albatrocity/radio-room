import { z } from "zod"

/** URL search values may be a single string or repeated keys → string[]. */
export const zStringArray = z.preprocess((v) => {
  if (v === undefined || v === null || v === "") return undefined
  if (Array.isArray(v)) return v
  if (typeof v === "string") return [v]
  return undefined
}, z.array(z.string()).optional())

export const zSearchBoolean = z.preprocess((v) => {
  if (v === undefined || v === null || v === "") return undefined
  if (v === true || v === "true" || v === "1") return true
  if (v === false || v === "false" || v === "0") return false
  return undefined
}, z.boolean().optional())
