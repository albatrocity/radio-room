import { Image, Link, Text } from "@chakra-ui/react"
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
      <Link rel="noopener noreferrer" textDecoration="underline" target="_blank" href={href}>
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

const ParsedEmojiMessage = ({ content }: { content: string }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGemoji, remarkBreaks, remarkGfm]}
      components={markdownTheme}
      children={content}
      skipHtml
    />
  )
}

export default ParsedEmojiMessage
