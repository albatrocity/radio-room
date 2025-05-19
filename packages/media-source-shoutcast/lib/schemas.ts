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

/**
 * Parse a string that may be stringified JSON into a validated object
 * @param jsonString - The string to parse
 * @param schema - Zod schema to validate against
 * @returns Parsed and validated object
 */
export function parseJsonString<T extends z.ZodType>(jsonString: string, schema: T): z.infer<T> {
  try {
    // First parse the string into an object
    const parsedData = JSON.parse(jsonString)

    // Then validate the object with Zod schema
    return schema.parse(parsedData)
  } catch (error) {
    if (error instanceof SyntaxError) {
      // Handle JSON parsing error
      throw new Error(`Invalid JSON string: ${error.message}`)
    }
    // Re-throw Zod validation errors or other errors
    throw error
  }
}
