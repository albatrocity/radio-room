import {
  Box,
  Code,
  Heading,
  Image,
  Link,
  Separator,
  Text,
} from "@chakra-ui/react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

const components = {
  p: ({ children }: { children?: React.ReactNode }) => <Text mb={2}>{children}</Text>,
  em: ({ children }: { children?: React.ReactNode }) => (
    <Box as="em" display="inline">
      {children}
    </Box>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <Box as="strong" fontWeight="semibold" display="inline">
      {children}
    </Box>
  ),
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <Link rel="noopener noreferrer" textDecoration="underline" target="_blank" href={href}>
      {children}
    </Link>
  ),
  img: ({ src, alt }: { src?: string; alt?: string }) => (
    <Image src={src} alt={alt || "Image"} maxW="100%" maxH="60vh" w="100%" objectFit="contain" my={2} />
  ),
  h1: ({ children }: { children?: React.ReactNode }) => (
    <Heading as="h2" size="lg" mt={4} mb={2}>
      {children}
    </Heading>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <Heading as="h3" size="md" mt={3} mb={2}>
      {children}
    </Heading>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <Heading as="h4" size="sm" mt={2} mb={1}>
      {children}
    </Heading>
  ),
  h4: ({ children }: { children?: React.ReactNode }) => (
    <Heading as="h5" size="xs" mt={2} mb={1}>
      {children}
    </Heading>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <Box as="ul" pl={5} my={2} listStyleType="disc">
      {children}
    </Box>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <Box as="ol" pl={5} my={2} listStyleType="decimal">
      {children}
    </Box>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <Box as="li" mb={1}>
      {children}
    </Box>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <Box borderLeftWidth="3px" borderColor="border.muted" pl={3} my={3} color="fg.muted">
      {children}
    </Box>
  ),
  hr: () => <Separator my={4} />,
  code: ({
    inline,
    className,
    children,
  }: {
    inline?: boolean
    className?: string
    children?: React.ReactNode
  }) =>
    inline ? (
      <Code fontSize="sm" px={1}>
        {children}
      </Code>
    ) : (
      <Code
        as="pre"
        display="block"
        whiteSpace="pre"
        overflowX="auto"
        p={3}
        my={3}
        fontSize="sm"
        className={className}
      >
        {children}
      </Code>
    ),
  /** Fenced blocks are `<pre><code>`; block `code` above is the styled surface. */
  pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  table: ({ children }: { children?: React.ReactNode }) => (
    <Box overflowX="auto" my={3}>
      <Box as="table" fontSize="sm" borderCollapse="collapse" width="100%">
        {children}
      </Box>
    </Box>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => <Box as="thead">{children}</Box>,
  tbody: ({ children }: { children?: React.ReactNode }) => <Box as="tbody">{children}</Box>,
  tr: ({ children }: { children?: React.ReactNode }) => <Box as="tr">{children}</Box>,
  th: ({ children }: { children?: React.ReactNode }) => (
    <Box as="th" borderWidth="1px" borderColor="border.muted" p={2} textAlign="left" fontWeight="semibold">
      {children}
    </Box>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <Box as="td" borderWidth="1px" borderColor="border.muted" p={2} verticalAlign="top">
      {children}
    </Box>
  ),
}

export default function SegmentNotesMarkdown({ content }: { content: string }) {
  return (
    <Box fontSize="sm" lineHeight="1.65">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {content}
      </ReactMarkdown>
    </Box>
  )
}
