// src/@chakra-ui/gatsby-plugin/theme.js
import { extendTheme } from "@chakra-ui/react"
const theme = {
  colors: {
    primary: "#f14561",
    "accent-1": "#6fab53",
    "accent-2": "#e55215",
    "accent-3": "#39e7ef",
    "accent-4": "#dbe4a9",
  },
  fontSizes: {
    xs: "0.75rem",
    sm: "0.875rem",
    md: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "1.875rem",
    "4xl": "2.25rem",
    "5xl": "3rem",
    "6xl": "3.75rem",
    "7xl": "4.5rem",
    "8xl": "6rem",
    "9xl": "8rem",
  },
}

export default extendTheme(theme)
