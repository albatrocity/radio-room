import React, { memo } from "react"
import { Box, Paragraph, Heading, Text, Image } from "grommet"
import Linkify from "react-linkify"
import { format } from "date-fns"
import { includes, filter, reduce } from "lodash/fp"
import getUrls from "../lib/getUrls"
import isImageUrl from "is-image-url"

const ChatMessage = ({
  content,
  mentions = [],
  timestamp,
  user,
  currentUserId,
}) => {
  const date = new Date(timestamp)
  const time = format(date, "p")
  const dateString = format(date, "M/d/y")
  const isMention = includes(currentUserId, mentions)
  const urls = getUrls(content)
  const images = filter(x => isImageUrl(x), urls)
  const parsedContent = reduce((mem, x) => mem.replace(x, ""), content, images)

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
        <Linkify>{parsedContent}</Linkify>
      </Paragraph>
      {images.length > 0 && (
        <Box gap="small">
          {images.map(x => (
            <div>
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
