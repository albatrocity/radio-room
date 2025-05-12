import React, { useEffect } from "react"
import { graphql, navigate } from "gatsby"

import Layout from "../components/layout"
import { Center, Heading } from "@chakra-ui/react"

const CallbackPage = () => {
  useEffect(() => {
    navigate(`${process.env.GATSBY_API_URL}/login?&redirect=/callback`)
  }, [])

  return (
    <Layout>
      <Center h="100vh">
        <Heading>Sending you to Spotify...</Heading>
      </Center>
    </Layout>
  )
}

export default CallbackPage

export function Head() {
  return (
    <>
      <title>Linking account...</title>
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1, maximum-scale=1"
      />
      <meta name="robots" content="noindex" />
    </>
  )
}

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
