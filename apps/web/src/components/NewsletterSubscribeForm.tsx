import { useState } from "react"
import { Box, Button, Field, Flex, Input, Stack, Text, VStack } from "@chakra-ui/react"
import { HTTPError } from "ky"

import { subscribeNewsletter } from "../lib/serverApi"

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
      as="section"
      direction="column"
      p={4}
      bg="secondaryBg"
      layerStyle="themeTransition"
      textStyle="footer"
      borderRadius="md"
      aria-labelledby="newsletter-subscribe-heading"
      gap={2}
    >
      <VStack align="flex-start" gap={0}>
        <Text fontSize="large" id="newsletter-subscribe-heading" fontWeight="semibold">
          Subscribe to the newsletter
        </Text>
        <Text fontSize="sm">
          About 2 emails per month: a reminder before the show, a summary after the show.
          Unsubscribe anytime.
        </Text>
      </VStack>

      {successMessage ? (
        <Text>{successMessage}</Text>
      ) : (
        <form onSubmit={handleSubmit}>
          <Flex gap={3} direction={{ base: "column", sm: "row" }} align={{ sm: "flex-end" }}>
            <Field.Root flex="1" invalid={!!error}>
              <Input
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="Email address"
                required
              />
              {error && <Field.ErrorText>{error}</Field.ErrorText>}
            </Field.Root>
            <Button
              type="submit"
              colorScheme="action"
              loading={isSubmitting}
              alignSelf={{ sm: "flex-end" }}
            >
              Subscribe
            </Button>
          </Flex>
        </form>
      )}
    </Stack>
  )
}
