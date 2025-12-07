// Chakra UI v3 theme configuration with dynamic theme support
import { createSystem, defaultConfig, defineConfig, defineRecipe } from "@chakra-ui/react"
import themes from "../themes"
import type { AppTheme } from "../types/AppTheme"

// Color shades we use
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const

// Color categories in our themes
const COLOR_CATEGORIES = ["primary", "secondary", "action"] as const

// Color palette semantic token mappings (shade references for light/dark modes)
// These enable colorPalette prop on components like Button
const PALETTE_TOKENS = {
  solid: { light: 500, dark: 800 },
  contrast: { light: 50, dark: 200 },
  fg: { light: 600, dark: 200 },
  muted: { light: 200, dark: 800 },
  subtle: { light: 100, dark: 900 },
  emphasized: { light: 200, dark: 800 },
  focusRing: { light: 500, dark: 500 },
} as const

// Generate conditions for each theme
function generateConditions(themeList: Record<string, AppTheme>) {
  const conditions: Record<string, string> = {}
  Object.keys(themeList).forEach((themeKey) => {
    const theme = themeList[themeKey]
    conditions[`theme${capitalize(theme.id)}`] = `[data-theme=${theme.id}] &`
  })
  return conditions
}

// Generate base color tokens for all themes
function generateColorTokens(themeList: Record<string, AppTheme>) {
  const colorTokens: Record<string, Record<string, Record<string, { value: string }>>> = {}

  Object.keys(themeList).forEach((themeKey) => {
    const theme = themeList[themeKey]
    colorTokens[theme.id] = {}

    COLOR_CATEGORIES.forEach((category) => {
      colorTokens[theme.id][category] = {}
      SHADES.forEach((shade) => {
        const color = theme.colors[category]?.[shade]
        if (color) {
          colorTokens[theme.id][category][shade] = { value: color }
        }
      })
    })
  })

  return colorTokens
}

// Generate semantic tokens with conditional values for each theme
function generateSemanticColorTokens(themeList: Record<string, AppTheme>) {
  const themeKeys = Object.keys(themeList)
  const defaultTheme = themeList[themeKeys[0]]

  const semanticTokens: Record<string, any> = {}

  COLOR_CATEGORIES.forEach((category) => {
    semanticTokens[category] = {}

    // Generate shade tokens (50-900)
    SHADES.forEach((shade) => {
      const conditionalValue: Record<string, string> = {
        base: `{colors.${defaultTheme.id}.${category}.${shade}}`,
      }
      themeKeys.forEach((themeKey) => {
        const theme = themeList[themeKey]
        conditionalValue[
          `_theme${capitalize(theme.id)}`
        ] = `{colors.${theme.id}.${category}.${shade}}`
      })
      semanticTokens[category][shade] = { value: conditionalValue }
    })

    // Generate color palette tokens (solid, contrast, fg, muted, subtle, emphasized, focusRing)
    Object.entries(PALETTE_TOKENS).forEach(([tokenName, shades]) => {
      const conditionalValue: Record<string, string> = {
        base: `{colors.${category}.${shades.light}}`,
        _dark: `{colors.${category}.${shades.dark}}`,
      }
      semanticTokens[category][tokenName] = { value: conditionalValue }
    })
  })

  return semanticTokens
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

// Generate everything from our themes
const conditions = generateConditions(themes)
const colorTokens = generateColorTokens(themes)
const semanticColorTokens = generateSemanticColorTokens(themes)

const buttonRecipe = defineRecipe({
  variants: {
    size: {
      xs: {
        h: "8",
        minW: "8",
        px: "1",
        fontSize: "xs",
        "& svg": {
          width: "4",
          height: "4",
        },
      },
    },
    variant: {
      bright: {
        bg: "transparent",
        color: "colorPalette.contrast",
        _hover: {
          bg: "colorPalette.solid/50",
        },
      },
      reaction: {
        borderRadius: 6,
        bg: "colorPalette.800/60",
        color: "colorPalette.contrast",
        padding: 0,
        height: "32px",
        minWidth: "32px",
        borderColor: "colorPalette.contrast/60",
        borderWidth: 1,
        _hover: {
          bg: "colorPalette.solid/50",
        },
        _dark: {
          bg: "colorPalette.800",
          color: "colorPalette.contrast",
          borderColor: "colorPalette.contrast/60",
        },
      },
      reactionBright: {
        borderRadius: 6,
        bg: "colorPalette.200/40",
        color: "colorPalette.contrast",
        padding: 0,
        height: "32px",
        minWidth: "32px",
        borderColor: "colorPalette.solid/20",
        borderWidth: 1,
        _hover: {
          bg: "colorPalette.200/60",
        },
        _dark: {
          bg: "colorPalette.800/30",
          color: "colorPalette.contrast",
          borderColor: "colorPalette.subtle/30",
        },
      },
    },
  },
})

const config = defineConfig({
  conditions,
  theme: {
    tokens: {
      colors: colorTokens,
    },
    semanticTokens: {
      colors: {
        // Dynamic theme colors with all shades and palette tokens
        ...semanticColorTokens,

        // Additional app-specific semantic tokens (using palette tokens)
        appBg: {
          value: { base: "{colors.white}", _dark: "{colors.primary.900}" },
        },
        secondaryText: {
          value: "{colors.secondary.fg}",
        },
        secondaryBg: {
          value: { base: "{colors.secondary.50}", _dark: "{colors.secondary.800}" },
        },
        secondaryBorder: {
          value: "{colors.secondary.muted}",
        },
        primaryBg: {
          value: "{colors.primary.subtle}",
        },
        actionBg: {
          value: { base: "{colors.action.600}", _dark: "{colors.action.700}" },
        },
        actionBgLite: {
          value: { base: "{colors.action.subtle}", _dark: "{colors.action.800}" },
        },
        actionBgDark: {
          value: { base: "{colors.action.800}", _dark: "{colors.action.800}" },
        },
        critical: {
          value: "{colors.action.solid}",
        },
        system: {
          value: { base: "{colors.secondary.subtle}", _dark: "rgba(0, 0, 0, 0.8)" },
        },
      },
    },
    recipes: {
      button: buttonRecipe,
    },
  },
  globalCss: {
    body: {
      bg: { base: "white", _dark: "secondary.900" },
    },
    button: {
      colorPalette: "action",
      minWidth: "10px",
    },
  },
})

export const system = createSystem(defaultConfig, config)
