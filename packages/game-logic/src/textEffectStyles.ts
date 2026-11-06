import type { TextEffect } from "@repo/types"

type FontValue = Extract<TextEffect, { type: "font" }>["value"]

function fontFamilyFor(value: FontValue): string | undefined {
  switch (value) {
    case "comicSans":
      // Comic Sans MS is Windows-only. iOS/macOS ship Chalkboard SE as the analog;
      // `cursive` on iOS is Snell Roundhand. Comic Neue is the OFL webfont fallback.
      return '"Comic Sans MS", "Comic Sans", "Chalkboard SE", "Comic Neue", cursive'
    case "monospace":
      return "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    case "serif":
      return 'ui-serif, Georgia, "Times New Roman", serif'
    case "papyrus":
      return '"Papyrus", fantasy'
    case "cursive":
      return "cursive"
    default:
      return undefined
  }
}

/**
 * Chakra ships no brown palette. Hosts that render text effects register these
 * under `colors.brown` (tokens and semantic tokens) so `brown.fg` resolves.
 */
export const BROWN_COLOR_TOKENS = {
  50: { value: "#faf5f0" },
  100: { value: "#f0e4d7" },
  200: { value: "#e0c8ae" },
  300: { value: "#c9a47f" },
  400: { value: "#b08257" },
  500: { value: "#93643a" },
  600: { value: "#7a4f2c" },
  700: { value: "#5f3c21" },
  800: { value: "#432a17" },
  900: { value: "#2b1b0f" },
}

export const BROWN_SEMANTIC_TOKENS = {
  solid: { value: "{colors.brown.600}" },
  contrast: { value: "white" },
  fg: { value: { base: "{colors.brown.700}", _dark: "{colors.brown.300}" } },
  muted: { value: { base: "{colors.brown.200}", _dark: "{colors.brown.800}" } },
  subtle: { value: { base: "{colors.brown.100}", _dark: "{colors.brown.900}" } },
  emphasized: { value: { base: "{colors.brown.300}", _dark: "{colors.brown.700}" } },
  focusRing: { value: "{colors.brown.600}" },
  border: { value: { base: "{colors.brown.500}", _dark: "{colors.brown.400}" } },
}

/**
 * CSS-like style properties generated from text effects.
 * Compatible with Chakra's SystemStyleObject and plain CSS.
 */
export interface TextEffectStyleObject {
  fontSize?: string
  fontFamily?: string
  color?: string
}

/**
 * Map declarative `TextEffect` from the server to CSS style props.
 * Plugins never send raw CSS; new effect types are added here.
 */
export function textEffectStyles(effects?: TextEffect[]): TextEffectStyleObject {
  const out: TextEffectStyleObject = {}
  for (const e of effects ?? []) {
    if (e.type === "color") {
      const token = e.token ?? "solid"
      out.color = `${e.palette}.${token}`
    } else if (e.type === "font") {
      out.fontFamily = fontFamilyFor(e.value)
    } else if (e.type === "size") {
      if (e.value === "4xs") {
        out.fontSize = "4xs"
      } else if (e.value === "3xs") {
        out.fontSize = "3xs"
      } else if (e.value === "2xs") {
        out.fontSize = "2xs"
      } else if (e.value === "xs" || e.value === "small") {
        out.fontSize = "xs"
      } else if (e.value === "sm") {
        out.fontSize = "sm"
      } else if (e.value === "large" || e.value === "lg") {
        out.fontSize = "lg"
      } else if (e.value === "xl") {
        out.fontSize = "xl"
      } else if (e.value === "2xl") {
        out.fontSize = "2xl"
      } else if (e.value === "3xl") {
        out.fontSize = "3xl"
      } else if (e.value === "4xl") {
        out.fontSize = "4xl"
      } else if (e.value === "5xl") {
        out.fontSize = "5xl"
      } else if (e.value === "6xl") {
        out.fontSize = "6xl"
      } else if (e.value === "7xl") {
        out.fontSize = "7xl"
      } else {
        out.fontSize = "md"
      }
    }
  }
  return out
}
