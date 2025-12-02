import { Text } from "@chakra-ui/react"
import { interpolateTemplate } from "@repo/utils"
import { usePluginComponentContext } from "../context"
import { CompositeTemplateRenderer } from "./CompositeTemplateRenderer"
import type { CompositeTemplate } from "../../../types/PluginComponent"

interface HeadingComponentProps {
  content: string | CompositeTemplate
  level?: 1 | 2 | 3 | 4
}

/**
 * Heading component - renders a heading (matches PluginSchemaElement heading).
 */
export function HeadingTemplateComponent({ content, level = 3 }: HeadingComponentProps) {
  const { store, config } = usePluginComponentContext()

  const sizeMap = { 1: "xl", 2: "lg", 3: "md", 4: "sm" } as const
  const size = sizeMap[level]

  const renderContent = () => {
    if (typeof content === "string") {
      return interpolateTemplate(content, { ...store, config })
    }
    return <CompositeTemplateRenderer template={content} values={{ ...store, config }} />
  }

  return (
    <Text as={`h${level}`} fontSize={size} fontWeight="bold" mb={2}>
      {renderContent()}
    </Text>
  )
}

