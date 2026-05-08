import * as LucideIcons from "lucide-react"
import type { LucideIconName } from "@repo/types"

type IconComponent = React.ComponentType

const iconCache = new Map<string, IconComponent | undefined>()

export function getIcon(iconName: LucideIconName | string): React.ComponentType | undefined {
  const normalizedName = iconName.trim()
  if (!normalizedName) return undefined

  if (iconCache.has(normalizedName)) {
    return iconCache.get(normalizedName)
  }

  const icon = (LucideIcons as Record<string, unknown>)[normalizedName]
  const resolvedIcon = icon != null ? (icon as IconComponent) : undefined

  iconCache.set(normalizedName, resolvedIcon)
  return resolvedIcon
}
