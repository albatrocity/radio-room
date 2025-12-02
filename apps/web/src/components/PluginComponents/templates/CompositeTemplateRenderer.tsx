import React from "react"
import { interpolateCompositeTemplate } from "@repo/utils"
import { renderTemplateComponent } from "./componentMap"
import type { CompositeTemplate } from "../../../types/PluginComponent"

/**
 * Renders a composite template (mix of text and components).
 */
export function CompositeTemplateRenderer({
  template,
  values,
}: {
  template: CompositeTemplate
  values: Record<string, unknown>
}) {
  // Interpolate all variables in the template
  const interpolated = interpolateCompositeTemplate(template, values)

  return (
    <>
      {interpolated.map((part, index) => {
        // Generate a unique key based on part content
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

