import React from "react"
import { ChakraProvider, extendTheme } from "@chakra-ui/react"
import PropTypes from "prop-types"
import Div100vh from "react-div-100vh"

import baseTheme from "../@chakra-ui/gatsby-plugin/theme"

import "./layout.css"
import themes from "../themes"

import { useCurrentTheme } from "../state/themeStore"

const ThemedLayout = ({ children }: { children: JSX.Element }) => {
  const chosenThemeId = useCurrentTheme()

  const chosenTheme = themes[chosenThemeId] ?? {}

  const mergedTheme = extendTheme(baseTheme, { colors: chosenTheme.colors })

  return (
    <ChakraProvider portalZIndex={10} theme={mergedTheme}>
      <Div100vh>{children}</Div100vh>
    </ChakraProvider>
  )
}

const Layout = ({ children }: { children: JSX.Element }) => {
  return <ThemedLayout>{children}</ThemedLayout>
}

Layout.propTypes = {
  children: PropTypes.node.isRequired,
}

export default Layout
