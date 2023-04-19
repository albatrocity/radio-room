import React from "react"
import { ChakraProvider, extendTheme } from "@chakra-ui/react"
import PropTypes from "prop-types"
import Div100vh from "react-div-100vh"

import baseTheme from "../@chakra-ui/gatsby-plugin/theme"

import "./layout.css"
import { GlobalStateProvider } from "../contexts/global"
import themes from "../themes"

import { useCurrentTheme, useThemeStore } from "../state/themeStore"

const ThemedLayout = ({ children }: { children: JSX.Element }) => {
  const chosenThemeId = useCurrentTheme()
  const t = useThemeStore()

  const chosenTheme = themes[chosenThemeId] ?? {}

  const mergedTheme = extendTheme(baseTheme, { colors: chosenTheme.colors })

  return (
    <ChakraProvider theme={mergedTheme}>
      <Div100vh>{children}</Div100vh>
    </ChakraProvider>
  )
}

const Layout = ({ children }: { children: JSX.Element }) => {
  return (
    <GlobalStateProvider>
      <ThemedLayout>{children}</ThemedLayout>
    </GlobalStateProvider>
  )
}

Layout.propTypes = {
  children: PropTypes.node.isRequired,
}

export default Layout
