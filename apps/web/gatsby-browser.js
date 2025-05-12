import React from "react"
import { ChakraProvider } from "@chakra-ui/react"
// import React from "react"
import chakraTheme from "@chakra-ui/theme"
/**
 * Implement Gatsby's Browser APIs in this file.
 *
 * See: https://www.gatsbyjs.org/docs/browser-apis/
 */

// You can delete this file if you're not using it

export const wrapPageElement = ({ element, props }) => {
  // props provide same data to Layout as Page element will get
  // including location, data, etc - you don't need to pass it
  return <ChakraProvider theme={chakraTheme}>{element}</ChakraProvider>
}
