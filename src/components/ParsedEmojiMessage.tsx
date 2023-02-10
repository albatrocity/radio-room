import React from "react"
import { Link, Text } from "@chakra-ui/react"
import ChakraUIRenderer from "chakra-ui-markdown-renderer"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkBreaks from "remark-breaks"
import remarkGemoji from "remark-gemoji"

const markdownTheme = {
  p: ({ children }) => {
    return <Text>{children}</Text>
  },
  em: ({ children }) => {
    return <Text as="em">{children}</Text>
  },
  a: ({ children, href }) => {
    return (
      <Link rel="noopener noreferrer" isExternal href={href}>
        {children}
      </Link>
    )
  },
}

const ParsedEmojiMessage = ({ content }: { content: string }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGemoji, remarkBreaks, remarkGfm]}
      components={ChakraUIRenderer(markdownTheme)}
      children={content}
      skipHtml
    />
  )
}

export default ParsedEmojiMessage
