// src/@chakra-ui/gatsby-plugin/theme.js
import type { StyleFunctionProps } from "@chakra-ui/styled-system"
import { defineStyle, defineStyleConfig } from "@chakra-ui/react"
import { buttonTheme } from "./buttonTheme"

import { mode, transparentize } from "@chakra-ui/theme-tools"
import {
  extendTheme,
  withDefaultColorScheme,
  ThemeConfig,
} from "@chakra-ui/react"
const config: ThemeConfig = {
  initialColorMode: "system",
  useSystemColorMode: true,
}

const pal2 = ["#c9cba3", "#ffe1a8", "#e26d5c", "#723d46", "#472d30"]
const pal3 = ["#053225", "#E34A6F", "#F7B2BD", "#B2A198", "#60A561"]

const forest = {
  action: {
    50: "#e2ffef",
    100: "#b9f8d7",
    200: "#8ff2c2",
    300: "#65eeaf",
    400: "#41e99f",
    500: "#2ed08b",
    600: "#22a171",
    700: "#167454",
    800: "#074633",
    900: "#00180f",
  },
  primary: {
    50: "#ffe5f0",
    100: "#fabbd0",
    200: "#f090ad",
    300: "#e86388",
    400: "#e03861",
    500: "#c71f52",
    600: "#9c164a",
    700: "#700e3b",
    800: "#450528",
    900: "#1e0012",
  },
  secondary: {
    50: "#d7ffff",
    100: "#acf9ff",
    200: "#7df5fc",
    300: "#4cf0fb",
    400: "#20ebf9",
    500: "#06d2df",
    600: "#00a3af",
    700: "#00757d",
    800: "#00474c",
    900: "#00191d",
  },
}

const theme = {
  config,
  styles: {
    global: (props: StyleFunctionProps) => ({
      body: {
        bg: mode("white", "secondary.900")(props),
      },
    }),
  },
  colors: {
    ...forest,
  },
  semanticTokens: {
    colors: {
      appBg: {
        default: "white",
        _dark: "primary.900",
      },
      secondaryText: {
        default: "secondary.600",
        _dark: "secondary.600",
      },
      secondaryBg: {
        default: "secondary.50",
        _dark: "secondary.800",
      },
      secondaryBorder: {
        default: "secondary.100",
        _dark: "secondary.800",
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
    },
    chatMessage: {
      opacity: 0.9,
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
  },
}

export default extendTheme(
  withDefaultColorScheme({
    colorScheme: "action",
  }),
  theme,
)
