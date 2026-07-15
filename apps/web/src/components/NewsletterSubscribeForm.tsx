import { useState } from "react"
import { Box, Button, Field, Flex, Input, Stack, Text, VStack } from "@chakra-ui/react"
import { HTTPError } from "ky"

import { subscribeNewsletter } from "../lib/serverApi"
import { Tooltip } from "./ui/tooltip"

type Props = {
  source?: string
}

async function getSubscribeErrorMessage(error: unknown): Promise<string> {
  if (error instanceof HTTPError) {
    try {
      const body = (await error.response.json()) as { error?: string }
      if (body.error) {
        return body.error
      }
    } catch {
      // Fall through to generic message.
    }
  }

  return "Something went wrong. Please try again."
}

export default function NewsletterSubscribeForm({ source = "web" }: Props) {
  const [email, setEmail] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const result = await subscribeNewsletter({ email: email.trim(), source })
      setSuccessMessage(
        result.alreadySubscribed
          ? "You're already subscribed to the newsletter."
          : "Check your email to confirm your subscription.",
      )
    } catch (submitError) {
      setError(await getSubscribeErrorMessage(submitError))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Stack
      width="100%"
      as="section"
      direction={{ base: "column", sm: "row" }}
      align="center"
      layerStyle="themeTransition"
      aria-labelledby="newsletter-subscribe-heading"
      gap={2}
      textStyle="footer"
    >
      <Tooltip
        content="About 2 emails per month: a reminder before the show, a summary after the show.
          Unsubscribe anytime."
      >
        <Box>
          <Text
            color={{ base: "colorPalette.solid", _dark: "colorPalette.contrast" }}
            id="newsletter-subscribe-heading"
            cursor="help"
          >
            Newsletter
          </Text>
        </Box>
      </Tooltip>

      {successMessage ? (
        <Text>{successMessage}</Text>
      ) : (
        <form onSubmit={handleSubmit}>
          <Stack gap={3} direction="row" align="center" justifyContent="center">
            <Field.Root invalid={!!error}>
              <Input
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="Email address"
                required
                borderColor={{ base: "colorPalette.solid", _dark: "colorPalette.subtle" }}
                color="colorPalette.contrast"
                _placeholder={{ color: "colorPalette.emphasized" }}
              />
              {error && <Field.ErrorText>{error}</Field.ErrorText>}
            </Field.Root>
            <Button
              size="sm"
              type="submit"
              variant={{ base: "solid", _dark: "surface" }}
              loading={isSubmitting}
              color={{ base: "actionBgDark", _dark: "colorPalette.contrast" }}
            >
              Subscribe
            </Button>
          </Stack>
        </form>
      )}
    </Stack>
  )
}
