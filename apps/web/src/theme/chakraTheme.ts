// Chakra UI theme configuration
import type { StyleFunctionProps } from "@chakra-ui/styled-system"
import { buttonTheme } from "./buttonTheme"
import defaultTheme from "../themes/default"

import { mode } from "@chakra-ui/theme-tools"
import {
  extendTheme,
  withDefaultColorScheme,
  ThemeConfig,
  extendBaseTheme,
} from "@chakra-ui/react"

const config: ThemeConfig = {
  initialColorMode: "system",
  useSystemColorMode: true,
}
const colors = defaultTheme.colors

const theme = {
  config,
  colors,
  styles: {
    global: (props: StyleFunctionProps) => ({
      body: {
        bg: mode("white", "secondary.900")(props),
      },
    }),
  },
  semanticTokens: {
    colors: {
      appBg: {
        default: "white",
        _dark: "primary.900",
      },
      secondaryText: {
        default: "secondary.500",
        _dark: "secondary.600",
      },
      secondaryBg: {
        default: "secondary.50",
        _dark: "secondary.800",
      },
      secondaryBorder: {
        default: "secondary.100",
        _dark: "secondary.700",
      },
      primary: {
        default: "primary.500",
        _dark: "primary.800",
      },
      primaryBg: {
        default: "primary.100",
        _dark: "primary.500",
      },
      actionBg: {
        default: "action.600",
        _dark: "action.700",
      },
      actionBgLite: {
        default: "action.100",
        _dark: "action.800",
      },
      action: {
        default: "action.600",
        _dark: "action.700",
      },
      critical: {
        default: "action.500",
      },
      system: {
        default: "secondary.50",
        _dark: "blackAlpha.800",
      },
    },
  },
  textStyles: {
    body: {
      "& p": {
        marginBottom: 3,
      },
      "& a": {
        textDecoration: "underline",
      },
      "& h1, & h2, & h3": {
        marginBottom: 3,
      },
      "& ul": {
        marginBottom: 3,
        marginLeft: 4,
        listStyleType: "disc",
      },
      "& ol": {
        marginBottom: 3,
      },
      "& li": {
        marginBottom: 2,
      },
    },
    chatMessage: {
      opacity: 0.9,
    },
    footer: {
      fontSize: "xs",
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
    Button: buttonTheme,
    Drawer: {
      baseStyle: {
        dialog: {
          background: "secondaryBg",
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

export const baseTheme = extendBaseTheme()

