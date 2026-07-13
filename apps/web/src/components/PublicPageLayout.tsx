import React from "react"
import { Box, Grid, GridItem, Heading, Link as ChakraLink, Wrap, HStack } from "@chakra-ui/react"
import { Link } from "@tanstack/react-router"

import Layout from "./layout"
import NewsletterSubscribeForm from "./NewsletterSubscribeForm"

type Props = {
  children: React.ReactNode
}

export default function PublicPageLayout({ children }: Props) {
  const isHome = window.location.pathname === "/"

  return (
    <Layout fill>
      <Grid templateRows="1fr auto" h="100vh">
        <GridItem>
          <Box as="main" p={4} flex={1} height="100%">
            {children}
          </Box>
        </GridItem>
        <GridItem as="footer" textStyle="footer">
          <HStack bg="secondaryBg" p={4} justify="space-between">
            <Wrap gap={4}>
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
            <NewsletterSubscribeForm />
          </HStack>
        </GridItem>
      </Grid>
    </Layout>
  )
}
