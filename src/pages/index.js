import React from "react"
import { Link } from "gatsby"
import { Box } from "grommet"

import Layout from "../components/layout"
import Image from "../components/image"
import SEO from "../components/seo"
import RadioApp from "../components/RadioApp"

const IndexPage = () => (
  <Layout>
    <SEO title="Home" />
    <RadioApp />
  </Layout>
)

export default IndexPage
