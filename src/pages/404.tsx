import React from "react"
import { HeadProps } from "gatsby"

import Layout from "../components/layout"

const NotFoundPage = () => (
  <Layout>
    <h1>NOT FOUND</h1>
    <p>You just hit a route that doesn&#39;t exist... the sadness.</p>
  </Layout>
)

export default NotFoundPage

export function Head({ data }: HeadProps) {
  console.log(data)

  return (
    <>
      <title>404: Not found</title>
      <meta name="description" content={data.site.siteMetadata.description} />
    </>
  )
}
