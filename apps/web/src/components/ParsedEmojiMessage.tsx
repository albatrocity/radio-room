import { Image, Link, Text } from "@chakra-ui/react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkBreaks from "remark-breaks"
import remarkGemoji from "remark-gemoji"

function buildMarkdownTheme(inlineParagraphs: boolean) {
  return {
    p: ({ children }) => {
      return (
        <Text as={inlineParagraphs ? "span" : undefined} display={inlineParagraphs ? "inline" : undefined}>
          {children}
        </Text>
      )
    },
    em: ({ children }) => {
      return (
        <Text as="em" display={inlineParagraphs ? "inline" : undefined}>
          {children}
        </Text>
      )
    },
    strong: ({ children }) => {
      return <strong style={{ display: inlineParagraphs ? "inline" : undefined }}>{children}</strong>
    },
    a: ({ children, href }) => {
      return (
        <Link
          rel="noopener noreferrer"
          textDecoration="underline"
          target="_blank"
          href={href}
          display={inlineParagraphs ? "inline" : undefined}
        >
          {children}
        </Link>
      )
    },
    img: ({ src, alt }) => {
      return (
        <Image src={src} alt={alt || "Image"} maxW="100%" maxH="60vh" w="100%" objectFit="contain" />
      )
    },
  }
}

const markdownTheme = buildMarkdownTheme(false)

const ParsedEmojiMessage = ({
  content,
  inlineParagraphs = false,
}: {
  content: string
  inlineParagraphs?: boolean
}) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGemoji, remarkBreaks, remarkGfm]}
      components={inlineParagraphs ? buildMarkdownTheme(true) : markdownTheme}
      children={content}
      skipHtml
    />
  )
}

export default ParsedEmojiMessage
