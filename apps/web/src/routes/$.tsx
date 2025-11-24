import React from "react"
import { createFileRoute } from '@tanstack/react-router'

import Layout from "../components/layout"
import { Text, Heading, Center } from "@chakra-ui/react"

export const Route = createFileRoute('/$')({
  component: NotFoundPage,
})

function NotFoundPage() {
  return (
    <Layout fill>
      <Center>
        <Heading>NOT FOUND</Heading>
        <Text as="p">You just hit a route that doesn&#39;t exist.</Text>
      </Center>
    </Layout>
  )
}

