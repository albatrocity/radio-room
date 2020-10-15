import React from "react"
import { Box, Text } from "grommet"

const ReactionCounterItem = ({ count, users, emoji }) => {
  return (
    <Box
      direction="row"
      gap="xsmall"
      background="light-1"
      round="xsmall"
      pad="xsmall"
      border={{ size: "xsmall", color: "light-3", side: "all" }}
    >
      <Text size="small">{emoji}</Text>
      <Text size="small" weight={500}>
        {count}
      </Text>
    </Box>
  )
}

export default ReactionCounterItem
