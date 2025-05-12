import React, { useEffect } from "react"
import { graphql, navigate } from "gatsby"

import Layout from "../components/layout"
import { Center, Heading } from "@chakra-ui/react"
import { useAuthStore } from "../state/authStore"

const LogoutPage = () => {
  const { send } = useAuthStore()
  useEffect(() => {
    send("LOGOUT")
    // navigate("/")
  }, [])

  return (
    <Layout>
      <Center h="100vh">
        <Heading>Logging out</Heading>
      </Center>
    </Layout>
  )
}

export default LogoutPage

export function Head() {
  return (
    <>
      <title>Logging out...</title>
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
