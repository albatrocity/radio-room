import React, { memo, useEffect, useState, useMemo } from "react"
import { Box, Paragraph, Heading, Text, Image } from "grommet"
import Linkify from "react-linkify"
import { format } from "date-fns"
import { includes, filter, reduce, get, concat } from "lodash/fp"
import getUrls from "../lib/getUrls"
import isImageUrl from "is-image-url"

const ChatMessage = ({
  content,
  mentions = [],
  timestamp,
  user,
  currentUserId,
}) => {
  const [parsedImageUrls, setParsedImageUrls] = useState([])
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
    >
      <Heading level={4} margin={{ bottom: "xsmall", top: "xsmall" }}>
        {user.username}
      </Heading>
      <Paragraph margin={{ bottom: "xsmall" }}>
        <Linkify properties={{ target: "_blank" }}>{parsedContent}</Linkify>
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
      <Box direction="row" gap="xsmall">
        <Text size="xsmall" color="dark-3">
          {time}
        </Text>
        <Text size="xsmall" color="dark-4">
          {dateString}
        </Text>
      </Box>
    </Box>
  )
}

export default memo(ChatMessage)
