import React from "react"
import { createFileRoute } from "@tanstack/react-router"

import PublicPageLayout from "../components/PublicPageLayout"
import Lobby from "../components/Lobby/Lobby"
import AppToasts from "../components/AppToasts"
import NewsletterSubscribeForm from "../components/NewsletterSubscribeForm"
import { Box } from "@chakra-ui/react"

export const Route = createFileRoute("/")({
  component: IndexPage,
})

function IndexPage() {
  return (
    <PublicPageLayout>
      <AppToasts />
      <Lobby />
      <Box maxW="600px">
        <NewsletterSubscribeForm />
      </Box>
    </PublicPageLayout>
  )
}
