import React from "react"
import { graphql } from "gatsby"

import Layout from "../components/layout"
import SpotifyAuthorization from "../components/SpotifyAuthorization"

const CallbackPage = () => (
  <Layout>
    <SpotifyAuthorization />
  </Layout>
)

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
