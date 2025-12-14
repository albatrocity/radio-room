import { Icon } from "@chakra-ui/react"
import { getIcon } from "../icons"
import type { IconComponentProps } from "../../../types/PluginComponent"

/**
 * Icon component - renders an icon with optional styling.
 */
export function IconTemplateComponent({ icon, size = "md", color }: IconComponentProps) {
  const IconComponent = getIcon(icon)
  if (!IconComponent) {
    console.warn(`[TemplateComponent] Unknown icon: ${icon}`)
    return null
  }

  const sizeMap = { sm: 3, md: 4, lg: 5 }
  const boxSize = sizeMap[size]

  return <Icon as={IconComponent} boxSize={boxSize} color={color} />
}
