import { z } from "zod"

export const stationSchema = z.object({
  bitrate: z.string(),
  title: z.string().optional(),
  listeners: z.string().optional(),
  fetchSource: z.string().optional(),
})
export type Station = z.infer<typeof stationSchema>

const stationProtocolSchema = z.enum(["shoutcastv1", "shoutcastv2", "icecast", "raw"])
export const stationProtocolEnum = stationProtocolSchema.enum
export type StationProtocol = z.infer<typeof stationProtocolSchema>
