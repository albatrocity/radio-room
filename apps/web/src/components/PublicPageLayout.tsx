import React from "react"
import { Box, Grid, GridItem, Heading, Link as ChakraLink, Wrap } from "@chakra-ui/react"
import { Link } from "@tanstack/react-router"

import Layout from "./layout"

type Props = {
  children: React.ReactNode
}

export default function PublicPageLayout({ children }: Props) {
  const isHome = window.location.pathname === "/"

  return (
    <Layout fill>
      <Grid templateRows="auto 1fr auto" h="100%">
        <GridItem>
          <Box p={4} bg="secondaryBg">
            <Heading as="h2" size="lg">
              {isHome ? (
                "Listening Room"
              ) : (
                <ChakraLink asChild>
                  <Link to="/">Listening Room</Link>
                </ChakraLink>
              )}
            </Heading>
          </Box>
        </GridItem>
        <GridItem>
          <Box as="main" p={4}>
            {children}
          </Box>
        </GridItem>
        <GridItem as="footer" textStyle="footer">
          <Wrap p={4} bg="secondaryBg" gap={4}>
            <ChakraLink asChild>
              <Link to="/privacy">Privacy Policy</Link>
            </ChakraLink>
            <ChakraLink asChild>
              <Link to="/about">About</Link>
            </ChakraLink>
            {import.meta.env.VITE_CONTACT_EMAIL && (
              <ChakraLink
                href={`mailto:${import.meta.env.VITE_CONTACT_EMAIL}?subject=Listening%20Room`}
              >
                Contact
              </ChakraLink>
            )}
          </Wrap>
        </GridItem>
      </Grid>
    </Layout>
  )
}
