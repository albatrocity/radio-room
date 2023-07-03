import React from "react"
import { ChakraProvider, extendTheme } from "@chakra-ui/react"
import PropTypes from "prop-types"
import Div100vh from "react-div-100vh"

import baseTheme from "../@chakra-ui/gatsby-plugin/theme"

import "./layout.css"
import themes from "../themes"

import { useCurrentTheme } from "../state/themeStore"

const ThemedLayout = ({
  children,
  fill,
}: {
  children: JSX.Element
  fill?: boolean
}) => {
  const chosenThemeId = useCurrentTheme()

  const chosenTheme = themes[chosenThemeId] ?? {}

  const mergedTheme = extendTheme(baseTheme, { colors: chosenTheme.colors })
  const Component = fill ? Div100vh : React.Fragment

  return (
    <ChakraProvider portalZIndex={10} theme={mergedTheme}>
      <Component>{children}</Component>
    </ChakraProvider>
  )
}

const Layout = ({
  children,
  fill = false,
}: {
  children: JSX.Element
  fill?: boolean
}) => {
  return <ThemedLayout fill={fill}>{children}</ThemedLayout>
}

Layout.propTypes = {
  children: PropTypes.node.isRequired,
}

export default Layout
