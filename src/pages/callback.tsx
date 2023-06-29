import React from "react"
import { HeadProps, graphql } from "gatsby"

import Layout from "../components/layout"

import { useIsStationOnline, useStationMeta } from "../state/audioStore"
import { StationMeta } from "../types/StationMeta"
import SpotifyAuthorization from "../components/SpotifyAuthorization"

const CallbackPage = () => (
  <Layout>
    <SpotifyAuthorization />
  </Layout>
)

export default CallbackPage

function buildTitle(meta?: StationMeta) {
  return `${meta?.track || meta?.title}${
    meta?.artist ? ` | ${meta.artist} ` : ""
  }`
}

export function Head({ data }: HeadProps) {
  const isOnline = useIsStationOnline()
  const meta = useStationMeta()
  return (
    <>
      <title>
        {isOnline ? `${buildTitle(meta)} | ` : ""}
        {data.site.siteMetadata.title}
      </title>
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
