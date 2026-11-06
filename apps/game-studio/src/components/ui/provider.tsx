"use client"

import { ChakraProvider, createSystem, defaultConfig, defineConfig } from "@chakra-ui/react"
import { BROWN_COLOR_TOKENS, BROWN_SEMANTIC_TOKENS } from "@repo/game-logic"
import { ColorModeProvider, type ColorModeProviderProps } from "./color-mode"
import { Toaster } from "./toaster"

const system = createSystem(
  defaultConfig,
  defineConfig({
    theme: {
      tokens: { colors: { brown: BROWN_COLOR_TOKENS } },
      semanticTokens: { colors: { brown: BROWN_SEMANTIC_TOKENS } },
    },
  }),
)

export function Provider(props: ColorModeProviderProps) {
  return (
    <ChakraProvider value={system}>
      <ColorModeProvider {...props} />
      <Toaster />
    </ChakraProvider>
  )
}
