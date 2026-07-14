import { useEffect, useState } from "react"
import { Box, AbsoluteCenter, Spinner } from "@chakra-ui/react"
import { render } from "@react-email/render"
import { NewsletterEmail, markdownToSanitizedHtml } from "@repo/email"

type Props = {
  subject: string
  bodyMarkdown: string
}

const PREVIEW_UNSUBSCRIBE_URL = "#unsubscribe-preview"

function resolvePreviewLogoUrl(): string | undefined {
  const cdn = (import.meta.env.VITE_ASSET_CDN_BASE_URL as string | undefined)?.trim()?.replace(
    /\/$/,
    "",
  )
  if (cdn) return `${cdn}/assets/logo.png`
  return undefined
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

/** Live preview: same template + markdown pipeline as outbound email, isolated in an iframe. */
export function NewsletterEmailPreview({ subject, bodyMarkdown }: Props) {
  const debouncedSubject = useDebounced(subject, 300)
  const debouncedBody = useDebounced(bodyMarkdown, 300)
  const [html, setHtml] = useState("")
  const [isRendering, setIsRendering] = useState(true)
  const logoUrl = resolvePreviewLogoUrl()

  useEffect(() => {
    let cancelled = false
    const bodyHtml = markdownToSanitizedHtml(debouncedBody)

    setIsRendering(true)
    void render(
      NewsletterEmail({
        subject: debouncedSubject,
        bodyHtml,
        unsubscribeUrl: PREVIEW_UNSUBSCRIBE_URL,
        logoUrl,
      }),
    )
      .then((result) => {
        if (!cancelled) {
          setHtml(result)
          setIsRendering(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHtml("")
          setIsRendering(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [debouncedSubject, debouncedBody, logoUrl])

  if (!html && isRendering) {
    return (
      <AbsoluteCenter>
        <Spinner />
      </AbsoluteCenter>
    )
  }

  return (
    <Box position="relative" flex="1" minH={0} w="100%" h="100%">
      {isRendering && html ? (
        <Box position="absolute" top={2} right={2} zIndex={1}>
          <Spinner size="sm" />
        </Box>
      ) : null}
      <Box
        as="iframe"
        title="Email preview"
        srcDoc={html}
        w="100%"
        h="100%"
        border="none"
      />
    </Box>
  )
}
