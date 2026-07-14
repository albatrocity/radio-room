import { render } from "@react-email/render"
import { marked } from "marked"
import sanitizeHtml from "sanitize-html"
import "./markdownRenderer"
import { NewsletterEmail } from "./templates/NewsletterEmail"
import { ConfirmEmail } from "./templates/ConfirmEmail"

const MARKDOWN_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h1", "h2", "h3", "h4", "h5", "h6"]),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    "*": ["class", "style"],
    img: ["src", "alt", "title", "width", "height", "class", "style"],
    a: ["href", "name", "target", "rel", "class", "style"],
    code: ["class", "style"],
    th: ["align", "class", "style"],
    td: ["align", "class", "style"],
    table: ["class", "style"],
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
  logoUrl?: string
}): Promise<string> {
  const bodyHtml = markdownToSanitizedHtml(input.bodyMarkdown)
  return render(
    NewsletterEmail({
      subject: input.subject,
      bodyHtml,
      unsubscribeUrl: input.unsubscribeUrl,
      logoUrl: input.logoUrl,
    }),
  )
}

export async function renderConfirmEmail(input: { confirmUrl: string }): Promise<string> {
  return render(ConfirmEmail({ confirmUrl: input.confirmUrl }))
}
