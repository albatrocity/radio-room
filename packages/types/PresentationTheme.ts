import { z } from "zod"

/**
 * Presentation themes for system messages and plugin-authored polls
 * (ADR 0203). One registry on the web renders both. Unknown themes fall back
 * to the plain look, so adding a theme here is backward compatible.
 */
export const presentationThemeSchema = z.enum(["road-trip"])

export type PresentationTheme = z.infer<typeof presentationThemeSchema>

export const presentationVariantSchema = z.enum(["info", "success", "warning", "error"])

export type PresentationVariant = z.infer<typeof presentationVariantSchema>
