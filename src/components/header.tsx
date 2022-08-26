import PropTypes from "prop-types"
import { Header as H } from "grommet"

const Header = () => <H background="brand"></H>

Header.propTypes = {
  siteTitle: PropTypes.string,
}

Header.defaultProps = {
  siteTitle: ``,
}

export default Header
