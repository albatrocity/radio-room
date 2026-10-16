import type { ReactNode } from "react"
import { Box, Code, Em, Link, Strong, Text, type BoxProps } from "@chakra-ui/react"
import ReactMarkdown from "react-markdown"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"

const components = {
  p: ({ children }: { children?: ReactNode }) => (
    <Text mb={2} _last={{ mb: 0 }}>
      {children}
    </Text>
  ),
  em: ({ children }: { children?: ReactNode }) => <Em>{children}</Em>,
  strong: ({ children }: { children?: ReactNode }) => <Strong fontWeight="semibold">{children}</Strong>,
  a: ({ children, href }: { children?: ReactNode; href?: string }) => (
    <Link href={href} target="_blank" rel="noopener noreferrer" textDecoration="underline">
      {children}
    </Link>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <Box as="ul" ps={5} mb={2} listStyleType="disc" textAlign="start">
      {children}
    </Box>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <Box as="ol" ps={5} mb={2} listStyleType="decimal" textAlign="start">
      {children}
    </Box>
  ),
  li: ({ children }: { children?: ReactNode }) => <Box as="li">{children}</Box>,
  blockquote: ({ children }: { children?: ReactNode }) => (
    <Box borderStartWidth="3px" borderColor="border.muted" ps={3} mb={2} color="fg.muted">
      {children}
    </Box>
  ),
  code: ({ children }: { children?: ReactNode }) => (
    <Code fontSize="xs" px={1}>
      {children}
    </Code>
  ),
  h1: ({ children }: { children?: ReactNode }) => <Text fontWeight="semibold">{children}</Text>,
  h2: ({ children }: { children?: ReactNode }) => <Text fontWeight="semibold">{children}</Text>,
  h3: ({ children }: { children?: ReactNode }) => <Text fontWeight="semibold">{children}</Text>,
  img: () => null,
}

/**
 * Item lore (ADR 0199) as basic markdown: emphasis, links, lists, quotes.
 * Single newlines are kept; bare URLs link; raw HTML and images are dropped.
 */
export function ItemLoreMarkdown({ children, ...props }: BoxProps & { children: string }) {
  return (
    <Box data-item-lore="" {...props}>
      <ReactMarkdown remarkPlugins={[remarkBreaks, remarkGfm]} components={components} skipHtml>
        {children}
      </ReactMarkdown>
    </Box>
  )
}
