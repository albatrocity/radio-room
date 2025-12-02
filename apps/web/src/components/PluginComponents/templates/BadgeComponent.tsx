import React from "react"
import { Badge, HStack, Icon, Text, Tooltip } from "@chakra-ui/react"
import { interpolateTemplate, interpolateCompositeTemplate } from "@repo/utils"
import { getIcon } from "../icons"
import { usePluginComponentContext } from "../context"
import { renderTemplateComponent } from "./componentMap"
import type { BadgeComponentProps } from "../../../types/PluginComponent"

/**
 * Badge component - renders a badge with optional icon and tooltip.
 */
export function BadgeTemplateComponent({ label, variant = "info", icon, tooltip }: BadgeComponentProps) {
  const { config } = usePluginComponentContext()
  const IconComponent = icon ? getIcon(icon) : undefined

  // Map variant to Chakra colorScheme
  const colorSchemeMap = {
    success: "green",
    warning: "orange",
    error: "red",
    info: "blue",
  }
  const colorScheme = colorSchemeMap[variant]

  // Render label content (string or CompositeTemplate)
  const renderLabel = () => {
    if (typeof label === "string") {
      return interpolateTemplate(label, { config })
    }

    // CompositeTemplate
    const interpolated = interpolateCompositeTemplate(label, { config })
    return (
      <>
        {interpolated.map((part, index) => {
          const key =
            part.type === "text"
              ? `text-${index}-${part.content.substring(0, 20)}`
              : `component-${index}-${part.name}`

          if (part.type === "text") {
            return <React.Fragment key={key}>{part.content}</React.Fragment>
          } else if (part.type === "component") {
            return renderTemplateComponent(part.name, part.props, key)
          }
          return null
        })}
      </>
    )
  }

  const badge = (
    <Badge colorScheme={colorScheme} variant="subtle" mt={1}>
      <HStack spacing={1}>
        {IconComponent && <Icon as={IconComponent} boxSize={3} />}
        <Text>{renderLabel()}</Text>
      </HStack>
    </Badge>
  )

  if (tooltip) {
    const tooltipText = interpolateTemplate(tooltip, { config })
    return <Tooltip label={tooltipText}>{badge}</Tooltip>
  }

  return badge
}

