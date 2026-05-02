import type { TextEffect } from "@repo/types"
import type { SystemStyleObject } from "@chakra-ui/react"

/**
 * Map declarative `TextEffect` from the server to Chakra `css` / style props.
 * Plugins never send raw CSS; new effect types are added here.
 */
export function textEffectStyles(effects?: TextEffect[]): SystemStyleObject {
  const out: SystemStyleObject = {}
  for (const e of effects ?? []) {
    if (e.type === "size") {
      if (e.value === "2xs") {
        out.fontSize = "2xs"
      } else if (e.value === "xs" || e.value === "small") {
        out.fontSize = "xs"
      } else if (e.value === "sm") {
        out.fontSize = "sm"
      } else if (e.value === "large") {
        out.fontSize = "lg"
      } else {
        out.fontSize = "md"
      }
    }
  }
  return out
}
