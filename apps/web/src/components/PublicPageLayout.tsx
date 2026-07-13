import React from "react"
import {
  Box,
  Grid,
  GridItem,
  Link as ChakraLink,
  Wrap,
  HStack,
  Popover,
  IconButton,
  Icon,
  Text,
  Stack,
} from "@chakra-ui/react"
import { Link } from "@tanstack/react-router"
import { LuPalette } from "react-icons/lu"

import Layout from "./layout"
import NewsletterSubscribeForm from "./NewsletterSubscribeForm"
import FormTheme from "./FormTheme"

type Props = {
  children: React.ReactNode
}

export default function PublicPageLayout({ children }: Props) {
  return (
    <Layout fill>
      <Grid templateRows="1fr auto" h="100vh" bg="primary.solid" layerStyle="themeTransition">
        <GridItem>
          <Box as="main" p={4} flex={1} height="100%">
            {children}
          </Box>
        </GridItem>
        <GridItem as="footer" textStyle="footer" colorPalette="action">
          <Stack
            bg="actionBgDark"
            p={4}
            direction={{ base: "column", sm: "row" }}
            justify="space-between"
          >
            <Wrap width={{ base: "100%", md: "50%" }} gap={4} align="center">
              <Popover.Root lazyMount positioning={{ placement: "top-start" }}>
                <Popover.Trigger asChild>
                  <IconButton
                    aria-label="Theme"
                    variant="ghost"
                    size="sm"
                    color="colorPalette.solid"
                  >
                    <Icon as={LuPalette} />
                  </IconButton>
                </Popover.Trigger>
                <Popover.Positioner>
                  <Popover.Content css={{ "--popover-bg": "{colors.appBg}" }}>
                    <Popover.Header fontWeight="bold">
                      <Text color="colorPalette.solid">Theme</Text>
                    </Popover.Header>
                    <Popover.Arrow />
                    <Popover.Body>
                      <FormTheme />
                    </Popover.Body>
                  </Popover.Content>
                </Popover.Positioner>
              </Popover.Root>
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

            <Box>
              <NewsletterSubscribeForm />
            </Box>
          </Stack>
        </GridItem>
      </Grid>
    </Layout>
  )
}
