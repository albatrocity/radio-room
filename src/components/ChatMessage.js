import React, { memo, useEffect, useContext, useState, useMemo } from "react"
import {
  Box,
  Paragraph,
  Heading,
  Text,
  Image,
  Anchor,
  ResponsiveContext,
} from "grommet"
import Linkify from "react-linkify"
import { format } from "date-fns"
import { includes, filter, reduce, get, concat } from "lodash/fp"
import getUrls from "../lib/getUrls"
import isImageUrl from "is-image-url"

import ReactionCounter from "./ReactionCounter"
import ParsedEmojiMessage from "./ParsedEmojiMessage"

const ChatMessage = ({
  content,
  mentions = [],
  timestamp,
  user,
  currentUserId,
  onOpenReactionPicker,
  onReactionClick,
  reactions,
}) => {
  const size = useContext(ResponsiveContext)
  const isMobile = size === "small"
  const [parsedImageUrls, setParsedImageUrls] = useState([])
  const [hovered, setHovered] = useState(false)
  const date = new Date(timestamp)
  const time = format(date, "p")
  const dateString = format(date, "M/d/y")
  const isMention = includes(currentUserId, mentions)
  const urls = useMemo(() => getUrls(content), [content])
  const images = concat(
    filter(x => isImageUrl(x), urls),
    parsedImageUrls
  )
  const parsedContent = reduce((mem, x) => mem.replace(x, ""), content, images)

  useEffect(() => {
    async function testUrls() {
      const responses = await Promise.all(
        filter(x => !isImageUrl(x), urls).map(x => fetch(x))
      )
      const blobs = await Promise.all(responses.map(x => x.blob()))
      const imageUrls = reduce(
        (mem, x) => {
          if (get("type", x).indexOf("image") > -1) {
            mem.push(urls[blobs.indexOf(x)])
          }
          return mem
        },
        [],
        blobs
      )
      if (imageUrls.length) {
        setParsedImageUrls(imageUrls)
      }
    }
    testUrls()
  }, [urls])

  return (
    <Box
      pad={isMention ? "small" : { vertical: "small" }}
      border={{ side: "bottom" }}
      background={isMention ? "accent-4" : "none"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Box direction="row-responsive" align="center" gap="small">
        <Heading level={4} margin={{ bottom: "xsmall", top: "xsmall" }}>
          {user.username}
        </Heading>
        <Box flex={{ shrink: 0 }} direction="row" gap="xsmall">
          <Text size="xsmall" color="dark-3">
            {time}
          </Text>
          <Text size="xsmall" color="dark-4">
            {dateString}
          </Text>
        </Box>
      </Box>
      <Paragraph margin={{ bottom: "xsmall" }}>
        <ParsedEmojiMessage content={parsedContent} />
      </Paragraph>
      {images.length > 0 && (
        <Box gap="small">
          {images.map(x => (
            <div key={x}>
              <Image src={x} />
            </div>
          ))}
        </Box>
      )}
      <Box direction="row" gap="xsmall" align="center">
        <ReactionCounter
          onOpenPicker={onOpenReactionPicker}
          reactTo={{ type: "message", id: timestamp }}
          reactions={reactions}
          onReactionClick={onReactionClick}
          iconColor="dark-5"
          iconHoverColor="brand"
          showAddButton={isMobile ? true : hovered}
        />
      </Box>
    </Box>
  )
}

export default memo(ChatMessage)
