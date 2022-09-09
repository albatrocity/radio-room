/**
 * Layout component that queries for data
 * with Gatsby's useStaticQuery component
 *
 * See: https://www.gatsbyjs.org/docs/use-static-query/
 */

import React from "react"
import PropTypes from "prop-types"
import { Grommet } from "grommet"
import Div100vh from "react-div-100vh"

import theme from "./theme"
import "./layout.css"
import { GlobalStateProvider } from "../contexts/global"

const Layout = ({ children }: { children: JSX.Element }) => {
  return (
    <Grommet theme={theme}>
      <GlobalStateProvider>
        <Div100vh>{children}</Div100vh>
      </GlobalStateProvider>
    </Grommet>
  )
}

Layout.propTypes = {
  children: PropTypes.node.isRequired,
}

export default Layout
