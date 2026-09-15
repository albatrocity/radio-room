import type { ReactNode } from "react"
import { Heading, Link, List, Text } from "@chakra-ui/react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

const components = {
  h3: ({ children }: { children?: ReactNode }) => (
    <Heading as="h3" size="sm" mt={3} mb={1}>
      {children}
    </Heading>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <Text fontSize="sm" color="fg.muted" mb={2}>
      {children}
    </Text>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <List.Root gap={1} ps={4} mb={2}>
      {children}
    </List.Root>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <List.Root as="ol" gap={1} ps={4} mb={2}>
      {children}
    </List.Root>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <List.Item fontSize="sm" color="fg.muted">
      {children}
    </List.Item>
  ),
  strong: ({ children }: { children?: ReactNode }) => (
    <Text as="strong" fontWeight="semibold">
      {children}
    </Text>
  ),
  a: ({ children, href }: { children?: ReactNode; href?: string }) => (
    <Link href={href} target="_blank" rel="noopener noreferrer" textDecoration="underline">
      {children}
    </Link>
  ),
}

/** Render a What’s new month body (not chat — no emoji / breaks plugins). */
export function WhatsNewMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
      {content}
    </ReactMarkdown>
  )
}
