import { Box, Text, Wrap } from "@chakra-ui/react"
import { interpolateTemplate } from "@repo/utils"
import { usePluginComponentContext } from "../context"
import { CompositeTemplateRenderer } from "./CompositeTemplateRenderer"
import type { CompositeTemplate } from "../../../types/PluginComponent"

interface TextBlockComponentProps {
  content: string | CompositeTemplate
  variant?: "info" | "warning" | "example"
}

/**
 * Text block component - renders styled text content (matches PluginSchemaElement text-block).
 */
export function TextBlockTemplateComponent({ content, variant = "info" }: TextBlockComponentProps) {
  const { store, config } = usePluginComponentContext()

  const bgColorMap = {
    info: "transparent",
    warning: "actionBgLite",
    example: "secondaryBg",
  }
  const bgColor = bgColorMap[variant]

  const renderContent = () => {
    if (typeof content === "string") {
      return interpolateTemplate(content, { ...store, config })
    }
    return (
      <Wrap gap={1} align="center">
        <CompositeTemplateRenderer template={content} values={{ ...store, config }} />
      </Wrap>
    )
  }

  return (
    <Box borderRadius="md" bg={bgColor}>
      <Text fontSize="sm">{renderContent()}</Text>
    </Box>
  )
}
