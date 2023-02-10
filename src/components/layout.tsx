import React from "react"
import { ChakraProvider, extendTheme } from "@chakra-ui/react"
import { useSelector } from "@xstate/react"
import PropTypes from "prop-types"
import Div100vh from "react-div-100vh"

import baseTheme from "../@chakra-ui/gatsby-plugin/theme"
import useGlobalContext from "./useGlobalContext"

import "./layout.css"
import { GlobalStateProvider } from "../contexts/global"
import themes from "../themes"

const ThemedLayout = ({ children }: { children: JSX.Element }) => {
  const selectedTheme = themes[0]
  const globalServices = useGlobalContext()

  const chosenThemeId = useSelector(
    globalServices.themeService,
    (state) => state.context.theme,
  )

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
