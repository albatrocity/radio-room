import React from "react"
import { createFileRoute } from '@tanstack/react-router'

import Layout from "../components/layout"
import SpotifyAuthorization from "../components/SpotifyAuthorization"

export const Route = createFileRoute('/callback')({
  component: CallbackPage,
})

function CallbackPage() {
  return (
    <Layout>
      <SpotifyAuthorization />
    </Layout>
  )
}

