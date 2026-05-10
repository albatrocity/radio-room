import type * as LucideStatic from "lucide-static"

/**
 * Canonical Lucide icon names (TitleCase) from package exports.
 * Examples: "Trophy", "SkipForward", "ShoppingCart".
 */
export type LucideIconName = Exclude<keyof typeof LucideStatic, "default">
