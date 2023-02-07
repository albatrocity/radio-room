// src/@chakra-ui/gatsby-plugin/theme.js
import {
  extendTheme,
  withDefaultColorScheme,
  ThemeConfig,
} from "@chakra-ui/react"
const config: ThemeConfig = {
  initialColorMode: "system",
  useSystemColorMode: true,
}

const theme = {
  config,
  colors: {
    primary: {
      "50": "#F1F7EE",
      "100": "#dbe4a9",
      "200": "#BDD9B0",
      "300": "#A3CA91",
      "400": "#89BB72",
      "500": "#6FAC53",
      "600": "#598943",
      "700": "#436732",
      "800": "#2D4521",
      "900": "#162211",
    },
    action: {
      "50": "#FDE7EB",
      "100": "#FABDC7",
      "200": "#F792A2",
      "300": "#F4677E",
      "400": "#F03D5A",
      "500": "#f14561",
      "600": "#BE0E2B",
      "700": "#8E0B20",
      "800": "#5F0715",
      "900": "#2F040B",
    },
  },
  semanticTokens: {
    colors: {
      base: {
        default: "primary.500",
        _dark: "primary.800",
      },
      background: {},
      baseBg: {
        default: "primary.50",
        _dark: "primary.900",
      },
      primaryBg: {
        default: "primary.100",
        _dark: "primary.400",
      },
      actionBg: {
        default: "action.500",
        _dark: "action.800",
      },
      action: {
        default: "action.500",
        _dark: "action.700",
      },
      critical: {
        default: "action.500",
      },
      system: {
        default: "primary.50",
        _dark: "primary.900",
      },
    },
  },
  textStyles: {
    body: {
      "& p": {
        marginBottom: 3,
      },
    },
  },
  components: {
    Popover: {
      variants: {
        responsive: {
          body: {
            padding: 0,
          },
        },
      },
    },
  },
}

export default extendTheme(
  withDefaultColorScheme({
    colorScheme: "primary",
  }),
  theme,
)
