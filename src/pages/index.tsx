import React from "react"
import { HeadProps, graphql } from "gatsby"

import PageLayout from "../components/PageLayout"
import Lobby from "../components/Lobby/Lobby"
import AppToasts from "../components/AppToasts"

const IndexPage = () => (
  <PageLayout>
    <AppToasts />
    <Lobby />
  </PageLayout>
)

export default IndexPage

export function Head({ data }: HeadProps) {
  return (
    <>
      <title>{data.site.siteMetadata.title}</title>
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1, maximum-scale=1"
      />
      <meta name="description" content={data.site.siteMetadata.description} />
      <meta
        name="og:description"
        content={data.site.siteMetadata.description}
      />
      <meta name="og:title" content={data.site.siteMetadata.title} />
      <meta name="og:type" content="website" />
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
