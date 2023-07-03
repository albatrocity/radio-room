import React from "react"
import { Box } from "@chakra-ui/react"

import Layout from "./layout"

type Props = {
  children: React.ReactNode
}

export default function PageLayout({ children }: Props) {
  return (
    <Layout>
      <Box as="main" p={4}>
        {children}
      </Box>
    </Layout>
  )
}
