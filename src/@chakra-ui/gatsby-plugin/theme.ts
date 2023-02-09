// src/@chakra-ui/gatsby-plugin/theme.js
import type { StyleFunctionProps } from "@chakra-ui/styled-system"
import { mode } from "@chakra-ui/theme-tools"
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
  styles: {
    global: (props: StyleFunctionProps) => ({
      body: {
        bg: mode("white", "primary.900")(props),
      },
    }),
  },
  colors: {
    primary: {
      "50": "#EAF1FA",
      "100": "#C5D8F1",
      "200": "#A0C0E8",
      "300": "#7BA7E0",
      "400": "#568ED7",
      "500": "#3175CE",
      "600": "#275EA5",
      "700": "#1D467C",
      "800": "#142F52",
      "900": "#0A1729",
    },
    action: {
      "50": "#FEE7EF",
      "100": "#FBBCD2",
      "200": "#F891B5",
      "300": "#F56598",
      "400": "#F33A7B",
      "500": "#F00F5E",
      "600": "#C00C4B",
      "700": "#900938",
      "800": "#600626",
      "900": "#300313",
    },
    secondary: {
      "50": "#FFF8E6",
      "100": "#FFEAB8",
      "200": "#FEDC8A",
      "300": "#FECF5D",
      "400": "#FEC12F",
      "500": "#FEB401",
      "600": "#CB9001",
      "700": "#986C01",
      "800": "#654801",
      "900": "#332400",
    },
  },
  semanticTokens: {
    colors: {
      base: {
        default: "primary.500",
        _dark: "primary.800",
      },
      baseBg: {
        default: "primary.50",
        _dark: "primary.800",
      },
      appBg: {
        default: "white",
        _dark: "primary.900",
      },
      secondaryBg: {
        default: "secondary.50",
        _dark: "secondary.900",
      },
      primaryBg: {
        default: "primary.100",
        _dark: "primary.500",
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
        default: "primary.100",
        _dark: "primary.700",
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
    colorScheme: "action",
  }),
  theme,
)
