import React from "react"
import { HeadProps, graphql } from "gatsby"

import Layout from "../components/layout"
import { Text, Heading, Center } from "@chakra-ui/react"

const NotFoundPage = () => (
  <Layout fill>
    <Center>
      <Heading>NOT FOUND</Heading>
      <Text as="p">You just hit a route that doesn&#39;t exist.</Text>
    </Center>
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
