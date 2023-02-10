import React from "react"
import { Box, HStack } from "@chakra-ui/react"
import { AppTheme } from "../types/AppTheme"

type Props = {
  theme: AppTheme
}

function ThemePreview({ theme }: Props) {
  return (
    <HStack spacing={4}>
      <HStack spacing={0}>
        <Box h={5} w={2} bg={theme.colors.primary[500]}></Box>
        <Box h={5} w={2} bg={theme.colors.secondary[50]}></Box>
        <Box h={5} w={2} bg={theme.colors.action[500]}></Box>
      </HStack>
      <HStack spacing={0}>
        <Box h={5} w={2} bg={theme.colors.primary[800]}></Box>
        <Box h={5} w={2} bg={theme.colors.secondary[800]}></Box>
        <Box h={5} w={2} bg={theme.colors.action[700]}></Box>
      </HStack>
    </HStack>
  )
}

export default ThemePreview
