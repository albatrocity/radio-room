import { render } from "@react-email/render"
import { marked } from "marked"
import sanitizeHtml from "sanitize-html"
import { NewsletterEmail } from "./templates/NewsletterEmail"
import { ConfirmEmail } from "./templates/ConfirmEmail"

const MARKDOWN_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h1", "h2"]),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    img: ["src", "alt", "title", "width", "height"],
    a: ["href", "name", "target", "rel"],
  },
}

export function markdownToSanitizedHtml(bodyMarkdown: string): string {
  const rawHtml = marked.parse(bodyMarkdown, { async: false }) as string
  return sanitizeHtml(rawHtml, MARKDOWN_SANITIZE_OPTIONS)
}

export async function renderNewsletter(input: {
  subject: string
  bodyMarkdown: string
  unsubscribeUrl: string
}): Promise<string> {
  const bodyHtml = markdownToSanitizedHtml(input.bodyMarkdown)
  return render(
    NewsletterEmail({
      subject: input.subject,
      bodyHtml,
      unsubscribeUrl: input.unsubscribeUrl,
    }),
  )
}

export async function renderConfirmEmail(input: { confirmUrl: string }): Promise<string> {
  return render(ConfirmEmail({ confirmUrl: input.confirmUrl }))
}
