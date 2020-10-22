import React from "react"
import { Helmet } from "react-helmet"

import Layout from "../components/layout"
import RadioApp from "../components/RadioApp"
import SEO from "../components/seo"

const IndexPage = () => (
  <Layout>
    <SEO title="Koney Live" />
    <Helmet>
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1, maximum-scale=1"
      />
    </Helmet>
    <RadioApp />
  </Layout>
)

export default IndexPage
