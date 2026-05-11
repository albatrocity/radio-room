import { z } from "zod"
import { reactionSchema } from "./Reaction"
import { userSchema } from "./User"

// =============================================================================
// ChatMessage Meta Schema
// =============================================================================

export const chatMessageMetaSchema = z.object({
  status: z.enum(["error", "success", "warning", "info"]).optional(),
  type: z.enum(["alert"]).nullable().optional(),
  title: z.string().nullable().optional(),
})

// =============================================================================
// Text effects & segments (plugin-driven rich chat; client maps to styles)
// =============================================================================

export const textEffectSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("size"),
    /** Maps to Chakra font sizes in `textEffectStyles` (`4xs`-`7xl`) plus legacy `small`/`normal`/`large`. */
    value: z.enum([
      "4xs",
      "3xs",
      "2xs",
      "xs",
      "sm",
      "small",
      "normal",
      "large",
      "lg",
      "xl",
      "2xl",
      "3xl",
      "4xl",
      "5xl",
      "6xl",
      "7xl",
    ]),
  }),
  z.object({
    type: z.literal("font"),
    /** Maps to font stacks in `textEffectStyles` on the web client. */
    value: z.enum(["comicSans"]),
  }),
  z.object({
    type: z.literal("color"),
    /** Chakra v3 palette — pairs with `token` for semantic colors (see theming/colors). */
    palette: z.enum([
      "gray",
      "red",
      "pink",
      "purple",
      "cyan",
      "blue",
      "teal",
      "green",
      "yellow",
      "orange",
    ]),
    /**
     * Semantic token within the palette; Chakra resolves light/dark.
     * Defaults to `solid` when omitted.
     */
    token: z
      .enum([
        "subtle",
        "muted",
        "emphasized",
        "solid",
        "fg",
        "contrast",
        "focusRing",
        "border",
      ])
      .optional(),
  }),
])
export type TextEffect = z.infer<typeof textEffectSchema>

export const textSegmentSchema = z.object({
  text: z.string(),
  effects: z.array(textEffectSchema).optional(),
})
export type TextSegment = z.infer<typeof textSegmentSchema>

// =============================================================================
// ChatMessage Schema & Type
// =============================================================================

export const chatMessageSchema = z.object({
  content: z.string(),
  /** When set, the client prefers this for rendering; `content` remains the canonical string. */
  contentSegments: z.array(textSegmentSchema).optional(),
  timestamp: z.string(),
  user: userSchema,
  mentions: z.array(z.string()).optional(),
  reactions: z.array(reactionSchema).optional(),
  meta: chatMessageMetaSchema.optional(),
})

export type ChatMessage = z.infer<typeof chatMessageSchema>
