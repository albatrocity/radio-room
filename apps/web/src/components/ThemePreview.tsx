import React from "react"
import { Box, HStack } from "@chakra-ui/react"
import { AppTheme } from "../types/AppTheme"
import { useDynamicPalette } from "../hooks/useDynamicTheme"

type Props = {
  theme: AppTheme
}

function ThemePreview({ theme }: Props) {
  const dynamicPalette = useDynamicPalette()

  // Use dynamic palette colors if this is the dynamic theme and we have extracted colors
  const colors = theme.id === "dynamic" && dynamicPalette ? dynamicPalette : theme.colors

  return (
    <HStack gap={4}>
      <HStack gap={0}>
        <Box h={5} w={2} bg={colors.primary[500]}></Box>
        <Box h={5} w={2} bg={colors.secondary[50]}></Box>
        <Box h={5} w={2} bg={colors.action[500]}></Box>
      </HStack>
      <HStack gap={0}>
        <Box h={5} w={2} bg={colors.primary[800]}></Box>
        <Box h={5} w={2} bg={colors.secondary[800]}></Box>
        <Box h={5} w={2} bg={colors.action[700]}></Box>
      </HStack>
    </HStack>
  )
}

export default ThemePreview
