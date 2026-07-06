import { useState } from "react"
import { Box, Button, Field, Flex, Input, Text } from "@chakra-ui/react"
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
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await subscribeNewsletter({ email: email.trim(), source })
      setIsSuccess(true)
    } catch (submitError) {
      setError(await getSubscribeErrorMessage(submitError))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Box
      as="section"
      p={4}
      bg="secondaryBg"
      layerStyle="themeTransition"
      textStyle="footer"
      borderRadius="md"
      aria-labelledby="newsletter-subscribe-heading"
    >
      <Text id="newsletter-subscribe-heading" fontWeight="semibold" mb={3}>
        Subscribe to the newsletter
      </Text>

      {isSuccess ? (
        <Text>Check your email to confirm your subscription.</Text>
      ) : (
        <form onSubmit={handleSubmit}>
          <Flex gap={3} direction={{ base: "column", sm: "row" }} align={{ sm: "flex-end" }}>
            <Field.Root flex="1" invalid={!!error}>
              <Field.Label>Email address</Field.Label>
              <Input
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
              {error && <Field.ErrorText>{error}</Field.ErrorText>}
            </Field.Root>
            <Button type="submit" loading={isSubmitting} alignSelf={{ sm: "flex-end" }}>
              Subscribe
            </Button>
          </Flex>
        </form>
      )}
    </Box>
  )
}
