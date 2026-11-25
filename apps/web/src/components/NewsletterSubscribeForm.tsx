import { useEffect, useState } from "react"
import { Box, Button, Field, Flex, Input, Stack, Text, VStack } from "@chakra-ui/react"
import { HTTPError } from "ky"

import { getNewsletterFormToken, subscribeNewsletter } from "../lib/serverApi"
import { Tooltip } from "./ui/tooltip"

type Props = {
  source?: string
}

/** Server tokens expire after 30 minutes; refresh well before that. */
const FORM_TOKEN_REFRESH_MS = 20 * 60 * 1000
const GENERIC_ERROR = "Something went wrong. Please try again."

const honeypotStyle: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  pointerEvents: "none",
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

  return GENERIC_ERROR
}

export default function NewsletterSubscribeForm({ source = "web" }: Props) {
  const [email, setEmail] = useState("")
  const [honeypot, setHoneypot] = useState("")
  const [formToken, setFormToken] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function refreshToken(isInitial: boolean) {
      try {
        const { token } = await getNewsletterFormToken()
        if (!cancelled) setFormToken(token)
      } catch {
        // A failed refresh keeps the previous token, which is still valid for a while.
        if (!cancelled && isInitial) setError(GENERIC_ERROR)
      }
    }

    refreshToken(true)
    const interval = window.setInterval(() => refreshToken(false), FORM_TOKEN_REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formToken) return
    setError(null)
    setIsSubmitting(true)

    try {
      await subscribeNewsletter({ email: email.trim(), source, website: honeypot, formToken })
      setSuccessMessage("Check your email to confirm your subscription.")
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
      justifyContent="center"
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
        <Text fontSize="xs" color={{ base: "colorPalette.solid", _dark: "colorPalette.contrast" }}>
          {successMessage}
        </Text>
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
            <div aria-hidden="true" style={honeypotStyle}>
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              type="submit"
              variant={{ base: "solid", _dark: "surface" }}
              loading={isSubmitting}
              disabled={!formToken}
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
