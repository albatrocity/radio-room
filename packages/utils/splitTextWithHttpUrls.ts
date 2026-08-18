export type TextWithHttpUrlPart =
  | { type: "text"; value: string }
  | { type: "url"; value: string }

const HTTP_URL_RE = /https?:\/\/[^\s<>]+/gi
const TRAILING_PUNCT_RE = /[.,)\]]+$/

/**
 * Split plain text into text and http(s) URL parts so UIs can auto-link.
 * Trailing `.`, `,`, `)`, `]` are left as adjacent text, not part of the href.
 */
export function splitTextWithHttpUrls(text: string): TextWithHttpUrlPart[] {
  const parts: TextWithHttpUrlPart[] = []
  const re = new RegExp(HTTP_URL_RE.source, HTTP_URL_RE.flags)
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const raw = match[0]
    const punct = raw.match(TRAILING_PUNCT_RE)
    const url = punct ? raw.slice(0, -punct[0].length) : raw
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, match.index) })
    }
    if (url) {
      parts.push({ type: "url", value: url })
      lastIndex = match.index + url.length
    } else {
      lastIndex = match.index + raw.length
    }
    re.lastIndex = lastIndex
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) })
  }
  if (parts.length === 0) {
    parts.push({ type: "text", value: text })
  }
  return parts
}
