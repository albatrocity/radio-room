import type { PresentationVariant } from "@repo/types"

export type RoadSignColors = { bg: string; fg: string; rule: string }

/**
 * Fixed sign colors (not theme tokens) so a road sign looks like a road sign in
 * both color modes. Each pair clears WCAG AA for normal text.
 */
export const ROAD_SIGN_COLORS: Record<PresentationVariant, RoadSignColors> = {
  info: { bg: "#1f6f43", fg: "#ffffff", rule: "rgba(255,255,255,0.85)" },
  success: { bg: "#1e4e9c", fg: "#ffffff", rule: "rgba(255,255,255,0.85)" },
  warning: { bg: "#f2c200", fg: "#111111", rule: "rgba(17,17,17,0.85)" },
  error: { bg: "#e8730c", fg: "#111111", rule: "rgba(17,17,17,0.85)" },
}

export const ROAD_SIGN_FONT =
  "'Overpass', 'Highway Gothic', 'Roboto Condensed', 'Arial Narrow', system-ui, sans-serif"

export function roadSignColors(variant: PresentationVariant | null | undefined): RoadSignColors {
  return ROAD_SIGN_COLORS[variant ?? "info"] ?? ROAD_SIGN_COLORS.info
}
