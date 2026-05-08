import * as LucideStatic from "lucide-static"
import type { LucideIconName } from "@repo/types"

const PASCAL_CASE_NAME = /^[A-Z][A-Za-z0-9]*$/

export function getLucideIconNames(): LucideIconName[] {
  return Object.keys(LucideStatic)
    .filter((key): key is LucideIconName => key !== "default" && PASCAL_CASE_NAME.test(key))
    .sort((a, b) => a.localeCompare(b))
}
