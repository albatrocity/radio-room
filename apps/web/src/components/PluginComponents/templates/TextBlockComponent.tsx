import { Alert, Box, Text, Wrap } from "@chakra-ui/react"
import { interpolateTemplate } from "@repo/utils"
import { usePluginComponentContext } from "../context"
import { CompositeTemplateRenderer } from "./CompositeTemplateRenderer"
import type { TextBlockComponentProps } from "../../../types/PluginComponent"

/**
 * Text block component - renders styled text content (matches PluginSchemaElement text-block).
 * With `status`, uses Chakra Alert for prominent color/background treatment.
 */
export function TextBlockTemplateComponent({
  content,
  variant = "info",
  status,
  alertVariant = "subtle",
  showIndicator = true,
  size = "sm",
  fontWeight,
}: TextBlockComponentProps) {
  const { store, config, textColor } = usePluginComponentContext()

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

  if (status) {
    return (
      <Alert.Root status={status} variant={alertVariant} borderRadius="md" width="full">
        {showIndicator !== false && <Alert.Indicator />}
        <Alert.Description fontSize={size} fontWeight={fontWeight} width="full">
          {renderContent()}
        </Alert.Description>
      </Alert.Root>
    )
  }

  const bgColorMap = {
    info: "transparent",
    warning: "actionBgLite",
    example: "secondaryBg",
  }
  const bgColor = bgColorMap[variant]

  return (
    <Box borderRadius="md" bg={bgColor} px={variant === "info" ? 0 : 2} py={variant === "info" ? 0 : 1}>
      <Text fontSize={size} fontWeight={fontWeight} color={textColor}>
        {renderContent()}
      </Text>
    </Box>
  )
}
