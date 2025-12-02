// Chakra UI v3 theme configuration
import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react"
import defaultTheme from "../themes/default"

const colors = defaultTheme.colors

const config = defineConfig({
  theme: {
    tokens: {
      colors: {
        primary: {
          50: { value: colors.primary[50] },
          100: { value: colors.primary[100] },
          200: { value: colors.primary[200] },
          300: { value: colors.primary[300] },
          400: { value: colors.primary[400] },
          500: { value: colors.primary[500] },
          600: { value: colors.primary[600] },
          700: { value: colors.primary[700] },
          800: { value: colors.primary[800] },
          900: { value: colors.primary[900] },
        },
        action: {
          50: { value: colors.action[50] },
          100: { value: colors.action[100] },
          200: { value: colors.action[200] },
          300: { value: colors.action[300] },
          400: { value: colors.action[400] },
          500: { value: colors.action[500] },
          600: { value: colors.action[600] },
          700: { value: colors.action[700] },
          800: { value: colors.action[800] },
          900: { value: colors.action[900] },
        },
        secondary: {
          50: { value: colors.secondary[50] },
          100: { value: colors.secondary[100] },
          200: { value: colors.secondary[200] },
          300: { value: colors.secondary[300] },
          400: { value: colors.secondary[400] },
          500: { value: colors.secondary[500] },
          600: { value: colors.secondary[600] },
          700: { value: colors.secondary[700] },
          800: { value: colors.secondary[800] },
          900: { value: colors.secondary[900] },
        },
      },
    },
    semanticTokens: {
      colors: {
        appBg: {
          value: { base: "{colors.white}", _dark: "{colors.primary.900}" },
        },
        secondaryText: {
          value: { base: "{colors.secondary.500}", _dark: "{colors.secondary.600}" },
        },
        secondaryBg: {
          value: { base: "{colors.secondary.50}", _dark: "{colors.secondary.800}" },
        },
        secondaryBorder: {
          value: { base: "{colors.secondary.100}", _dark: "{colors.secondary.700}" },
        },
        primary: {
          value: { base: "{colors.primary.500}", _dark: "{colors.primary.800}" },
        },
        primaryBg: {
          value: { base: "{colors.primary.100}", _dark: "{colors.primary.500}" },
        },
        actionBg: {
          value: { base: "{colors.action.600}", _dark: "{colors.action.700}" },
        },
        actionBgLite: {
          value: { base: "{colors.action.100}", _dark: "{colors.action.800}" },
        },
        action: {
          value: { base: "{colors.action.600}", _dark: "{colors.action.700}" },
        },
        critical: {
          value: { base: "{colors.action.500}", _dark: "{colors.action.500}" },
        },
        system: {
          value: { base: "{colors.secondary.50}", _dark: "rgba(0, 0, 0, 0.8)" },
        },
      },
    },
  },
  globalCss: {
    body: {
      bg: { base: "white", _dark: "secondary.900" },
    },
  },
})

export const system = createSystem(defaultConfig, config)
