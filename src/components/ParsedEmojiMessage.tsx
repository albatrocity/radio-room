import React from "react"
import Linkify from "react-linkify"
import nl2br from "react-nl2br"
import { Link } from "@chakra-ui/react"
import { MultiLineParser } from "text-emoji-parser"

const componentDecorator = (href: string, text: string, key: any) => (
  <Link href={href} key={key} target="_blank" rel="noopener noreferrer">
    {text}
  </Link>
)

const ParsedEmojiMessage = ({ content }: { content: string }) => {
  const ParsedNode = MultiLineParser(
    content,
    {
      SplitLinesTag: "p",
      Rule: /(?:\:[^\:]+\:(?:\:skin-tone-(?:\d)\:)?)/gi,
    },
    (Rule) => {
      return <em-emoji shortcodes={Rule} />
    },
  )

  return (
    <>
      <Linkify componentDecorator={componentDecorator}>
        {nl2br(ParsedNode)}
      </Linkify>
    </>
  )
}

export default ParsedEmojiMessage
