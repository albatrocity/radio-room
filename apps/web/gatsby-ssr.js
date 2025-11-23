import React from "react"
import { ChakraProvider } from "@chakra-ui/react"
import customTheme from "./src/@chakra-ui/gatsby-plugin/theme"

/**
 * Implement Gatsby's SSR (Server Side Rendering) APIs in this file.
 *
 * See: https://www.gatsbyjs.org/docs/ssr-apis/
 */

export const wrapPageElement = ({ element, props }) => {
  // props provide same data to Layout as Page element will get
  // including location, data, etc - you don't need to pass it
  return <ChakraProvider theme={customTheme}>{element}</ChakraProvider>
}
