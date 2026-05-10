/**
 * Split markdown text on `![alt](url)` image tokens so images can be laid out
 * on their own line while surrounding text stays inline.
 */
export type MarkdownImageChunk =
  | { type: "text"; value: string }
  | { type: "image"; alt: string; src: string }

const IMAGE_MD_RE = /!\[([^\]]*)\]\(([^)]+)\)/g

export function splitMarkdownImages(text: string): MarkdownImageChunk[] {
  const parts: MarkdownImageChunk[] = []
  let lastIndex = 0
  const re = new RegExp(IMAGE_MD_RE.source, "g")
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, m.index) })
    }
    parts.push({ type: "image", alt: m[1] ?? "", src: m[2] ?? "" })
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) })
  }
  if (parts.length === 0) {
    parts.push({ type: "text", value: text })
  }
  return parts
}
