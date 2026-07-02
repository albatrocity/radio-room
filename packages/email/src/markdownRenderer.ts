import { marked, type RendererObject } from "marked"
import { EMAIL_STYLES } from "./emailStyles"

const { colors, fonts, sizes, spacing, lineHeight } = EMAIL_STYLES
const light = colors.light

function headingKey(depth: number): keyof typeof spacing.headingMargin {
  return `h${Math.min(Math.max(depth, 1), 6)}` as keyof typeof spacing.headingMargin
}

function headingSize(depth: number): string {
  return sizes[`h${Math.min(Math.max(depth, 1), 6)}` as keyof typeof sizes]
}

function styleAttr(styles: Record<string, string | number | undefined>): string {
  const css = Object.entries(styles)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${value}`)
    .join(";")
  return css ? ` style="${css}"` : ""
}

export const emailMarkdownRenderer: RendererObject = {
  heading({ tokens, depth }) {
    const margin = spacing.headingMargin[headingKey(depth)] ?? "16px 0 8px"
    return `<h${depth} class="email-heading"${styleAttr({
      fontSize: headingSize(depth),
      fontWeight: 600,
      margin,
      color: light.heading,
      lineHeight: lineHeight.body,
    })}>${this.parser.parseInline(tokens)}</h${depth}>\n`
  },

  paragraph({ tokens }) {
    return `<p class="email-text"${styleAttr({
      margin: spacing.paragraphMargin,
      lineHeight: lineHeight.body,
      color: light.text,
      fontSize: sizes.body,
    })}>${this.parser.parseInline(tokens)}</p>\n`
  },

  strong({ tokens }) {
    return `<strong class="email-text"${styleAttr({
      fontWeight: 600,
      color: light.text,
    })}>${this.parser.parseInline(tokens)}</strong>`
  },

  em({ tokens }) {
    return `<em class="email-text"${styleAttr({
      fontStyle: "italic",
      color: light.text,
    })}>${this.parser.parseInline(tokens)}</em>`
  },

  link({ href, tokens }) {
    return `<a class="email-link" href="${href}"${styleAttr({
      color: light.link,
      textDecoration: "underline",
    })}>${this.parser.parseInline(tokens)}</a>`
  },

  list(token) {
    const tag = token.ordered ? "ol" : "ul"
    const body = token.items.map((item) => this.listitem(item)).join("")
    return `<${tag} class="email-text"${styleAttr({
      margin: spacing.listMargin,
      padding: spacing.listPadding,
      color: light.text,
      fontSize: sizes.body,
      lineHeight: lineHeight.body,
    })}>${body}</${tag}>\n`
  },

  listitem(item) {
    return `<li class="email-text"${styleAttr({
      margin: spacing.listItemMargin,
      color: light.text,
    })}>${this.parser.parse(item.tokens)}</li>\n`
  },

  blockquote({ tokens }) {
    return `<blockquote class="email-blockquote"${styleAttr({
      margin: spacing.blockquoteMargin,
      padding: spacing.blockquotePadding,
      borderLeft: `4px solid ${light.blockquoteBorder}`,
      color: light.muted,
      fontSize: sizes.body,
      lineHeight: lineHeight.body,
    })}>${this.parser.parse(tokens)}</blockquote>\n`
  },

  codespan({ text }) {
    return `<code class="email-code"${styleAttr({
      fontFamily: fonts.mono,
      fontSize: sizes.code,
      backgroundColor: light.codeBg,
      border: `1px solid ${light.codeBorder}`,
      borderRadius: "4px",
      padding: "2px 6px",
      color: light.text,
    })}>${text}</code>`
  },

  code({ text, lang }) {
    const langClass = lang ? ` class="language-${lang}"` : ""
    return `<pre class="email-code"${styleAttr({
      margin: spacing.codeBlockMargin,
      padding: spacing.codeBlockPadding,
      backgroundColor: light.codeBg,
      border: `1px solid ${light.codeBorder}`,
      borderRadius: "6px",
      overflowX: "auto",
      fontFamily: fonts.mono,
      fontSize: sizes.code,
      lineHeight: lineHeight.code,
      color: light.text,
    })}><code class="email-code"${langClass}${styleAttr({
      fontFamily: fonts.mono,
      fontSize: sizes.code,
      color: light.text,
    })}>${text}</code></pre>\n`
  },

  hr() {
    return `<hr class="email-hr"${styleAttr({
      border: "none",
      borderTop: `1px solid ${light.hr}`,
      margin: spacing.hrMargin,
    })}>\n`
  },

  image({ href, title, text }) {
    const titleAttr = title ? ` title="${title}"` : ""
    const alt = text || ""
    return `<img class="email-image" src="${href}" alt="${alt}"${titleAttr}${styleAttr({
      maxWidth: "100%",
      height: "auto",
      display: "block",
      margin: spacing.paragraphMargin,
    })}>`
  },

  table({ header, rows }) {
    const headerHtml = header
      .map(
        (cell) =>
          `<th class="email-text"${styleAttr({
            padding: "8px 12px",
            border: `1px solid ${light.codeBorder}`,
            textAlign: "left",
            color: light.heading,
            fontWeight: 600,
          })}>${this.parser.parseInline(cell.tokens)}</th>`,
      )
      .join("")
    const bodyHtml = rows
      .map(
        (row) =>
          `<tr>${row
            .map(
              (cell) =>
                `<td class="email-text"${styleAttr({
                  padding: "8px 12px",
                  border: `1px solid ${light.codeBorder}`,
                  color: light.text,
                })}>${this.parser.parseInline(cell.tokens)}</td>`,
            )
            .join("")}</tr>`,
      )
      .join("")
    return `<table class="email-text"${styleAttr({
      width: "100%",
      borderCollapse: "collapse",
      margin: spacing.listMargin,
      fontSize: sizes.body,
    })}><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>\n`
  },
}

marked.use({ renderer: emailMarkdownRenderer })
