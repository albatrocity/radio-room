import React from "react"
import {
  Box,
  Flex,
  Grid,
  GridItem,
  HStack,
  Icon,
  Link as ChakraLink,
  Wrap,
  Popover,
  IconButton,
  Text,
  Stack,
  Switch,
} from "@chakra-ui/react"
import { Link } from "@tanstack/react-router"
import { LuMoon } from "react-icons/lu"

import Layout from "./layout"
import NewsletterSubscribeForm from "./NewsletterSubscribeForm"
import FormTheme from "./FormTheme"
import { Logo } from "./ui/logo"
import { useColorMode } from "./ui/color-mode"

type Props = {
  children: React.ReactNode
}

export default function PublicPageLayout({ children }: Props) {
  const { colorMode, toggleColorMode } = useColorMode()

  return (
    <Layout fill dynamicFallbackToDefault>
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
                    variant="plain"
                    size="md"
                    color="colorPalette.solid"
                  >
                    <Logo
                      primaryColor={{ base: "colorPalette.solid", _dark: "colorPalette.contrast" }}
                      secondaryColor="actionBgDark"
                    />
                  </IconButton>
                </Popover.Trigger>
                <Popover.Positioner>
                  <Popover.Content colorPalette="action" css={{ "--popover-bg": "{colors.appBg}" }}>
                    <Popover.Header fontWeight="bold">
                      <HStack align="center">
                        <Flex grow={1}>
                          <Text
                            color={{ base: "colorPalette.solid", _dark: "colorPalette.contrast" }}
                          >
                            Theme
                          </Text>
                        </Flex>
                        <HStack align="center">
                          <Icon as={LuMoon} aria-label="Dark Mode" />
                          <Switch.Root
                            id="publicDarkMode"
                            onCheckedChange={toggleColorMode}
                            checked={colorMode === "dark"}
                          >
                            <Switch.HiddenInput />
                            <Switch.Control>
                              <Switch.Thumb />
                            </Switch.Control>
                          </Switch.Root>
                        </HStack>
                      </HStack>
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
              <Text fontSize="xs" color="colorPalette.fg">
                Branding by Collin Rausch
              </Text>
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
