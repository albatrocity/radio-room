import React from "react"
import { HeadProps, graphql } from "gatsby"

import Layout from "../components/layout"
import { Box } from "@chakra-ui/react"

const NotFoundPage = () => (
  <Layout>
    <Box>
      <h1>NOT FOUND</h1>
      <p>You just hit a route that doesn&#39;t exist... the sadness.</p>
    </Box>
  </Layout>
)

export default NotFoundPage

export const query = graphql`
  query {
    site {
      siteMetadata {
        title
        description
        author
      }
    }
  }
`

export function Head({ data }: HeadProps) {
  return (
    <>
      <title>404: Not found</title>
      <meta name="description" content={data.site.siteMetadata.description} />
    </>
  )
}
