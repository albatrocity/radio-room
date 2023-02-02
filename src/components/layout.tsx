/**
 * Layout component that queries for data
 * with Gatsby's useStaticQuery component
 *
 * See: https://www.gatsbyjs.org/docs/use-static-query/
 */

import React from "react"
import PropTypes from "prop-types"
import Div100vh from "react-div-100vh"

import "./layout.css"
import { GlobalStateProvider } from "../contexts/global"

const Layout = ({ children }: { children: JSX.Element }) => {
  return (
    <GlobalStateProvider>
      <Div100vh>{children}</Div100vh>
    </GlobalStateProvider>
  )
}

Layout.propTypes = {
  children: PropTypes.node.isRequired,
}

export default Layout
