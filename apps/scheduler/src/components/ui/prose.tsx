"use client"

import { Box, type BoxProps } from "@chakra-ui/react"

const sizes = {
  sm: { body: "sm", h1: "xl", h2: "lg", h3: "md", h4: "sm", code: "xs" },
  md: { body: "md", h1: "2xl", h2: "xl", h3: "lg", h4: "md", code: "sm" },
  lg: { body: "lg", h1: "3xl", h2: "2xl", h3: "xl", h4: "lg", code: "md" },
} as const

export type ProseProps = BoxProps & {
  size?: keyof typeof sizes
}

/**
 * Styles rendered HTML/Markdown to match app typography (Chakra Prose pattern).
 * @see https://chakra-ui.com/docs/components/prose
 */
export function Prose({ size = "md", css, ...props }: ProseProps) {
  const t = sizes[size]
  const baseCss = {
        "& :where(h1, h2, h3, h4, h5, h6)": {
          fontWeight: "semibold",
          lineHeight: "1.3",
          textWrap: "balance",
        },
        "& h1": { fontSize: t.h1, marginTop: "0", marginBottom: "0.5em" },
        "& h2": { fontSize: t.h2, marginTop: "1.4em", marginBottom: "0.45em" },
        "& h3": { fontSize: t.h3, marginTop: "1.25em", marginBottom: "0.4em" },
        "& h4": { fontSize: t.h4, marginTop: "1.1em", marginBottom: "0.35em" },
        "& h5, & h6": { fontSize: t.body, marginTop: "1em", marginBottom: "0.3em" },
        "& p": { marginTop: "0.75em", marginBottom: "0.75em" },
        "& p:first-child": { marginTop: "0" },
        "& p:last-child": { marginBottom: "0" },
        "& a": { color: "colorPalette.fg", textDecoration: "underline" },
        "& strong, & b": { fontWeight: "semibold" },
        "& ul, & ol": { marginTop: "0.75em", marginBottom: "0.75em", paddingInlineStart: "1.25em" },
        "& li": { marginTop: "0.25em", marginBottom: "0.25em" },
        "& blockquote": {
          marginTop: "1em",
          marginBottom: "1em",
          paddingInlineStart: "1em",
          borderInlineStartWidth: "4px",
          borderInlineStartColor: "border.muted",
          color: "fg.muted",
          fontStyle: "italic",
        },
        "& hr": {
          marginTop: "2em",
          marginBottom: "2em",
          border: "0",
          borderTopWidth: "1px",
          borderTopColor: "border.muted",
        },
        "& :where(code):not(pre code)": {
          fontSize: t.code,
          fontFamily: "mono",
          bg: "bg.muted",
          px: "0.2em",
          py: "0.05em",
          borderRadius: "sm",
        },
        "& pre": {
          marginTop: "1em",
          marginBottom: "1em",
          padding: "1em",
          overflowX: "auto",
          borderRadius: "md",
          borderWidth: "1px",
          borderColor: "border.muted",
          bg: "bg.muted",
          fontSize: t.code,
        },
        "& pre code": {
          fontFamily: "mono",
          bg: "transparent",
          p: "0",
          borderRadius: "0",
        },
        "& table": {
          width: "100%",
          marginTop: "1em",
          marginBottom: "1em",
          fontSize: t.code,
          borderCollapse: "collapse",
        },
        "& th, & td": {
          borderBottomWidth: "1px",
          borderColor: "border.muted",
          padding: "0.5em 0.75em",
          textAlign: "start",
        },
        "& th": { fontWeight: "semibold", color: "fg" },
        "& img": { maxWidth: "100%", height: "auto", borderRadius: "md" },
  }

  return (
    <Box
      colorPalette="blue"
      fontSize={t.body}
      lineHeight="1.75"
      color="fg"
      maxW="65ch"
      css={[baseCss, css]}
      {...props}
    />
  )
}
