import { Link } from "gatsby"
import PropTypes from "prop-types"
import React from "react"
import { Header as H } from "grommet"

const Header = ({ siteTitle }) => (
  <H background="brand">
    <Menu label="account" items={[{ label: "logout" }]} />
  </H>
)

Header.propTypes = {
  siteTitle: PropTypes.string,
}

Header.defaultProps = {
  siteTitle: ``,
}

export default Header
