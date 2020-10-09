import React, { memo } from "react"
import { Box, Paragraph, Text } from "grommet"
import { format } from "date-fns"

const SystemMessage = ({ content, timestamp, user, meta = {} }) => {
  const date = new Date(timestamp)
  const time = format(date, "p")
  const dateString = format(date, "M/d/y")
  const { status } = meta
  return (
    <Box
      pad="small"
      border={{ side: "bottom" }}
      background={status === "critical" ? "status-critical" : "light-1"}
      align="center"
    >
      <Paragraph
        style={{ maxWidth: "none" }}
        size="small"
        margin={{ bottom: "xsmall" }}
      >
        {content}
      </Paragraph>
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

export default memo(SystemMessage)
