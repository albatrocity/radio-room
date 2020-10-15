import React, { useContext } from "react"
import { Box, Text, List, ResponsiveContext } from "grommet"
import { format } from "date-fns"

const Playlist = ({ data = [] }) => {
  const size = useContext(ResponsiveContext)
  const isMobile = size === "small"
  return (
    <List
      data={data}
      children={(item, index) => (
        <Box
          direction={"row-responsive"}
          gap={isMobile ? "small" : "medium"}
          justify="between"
          align="center"
        >
          {(item.track || item.album) && (
            <Box flex={true} direction="column">
              <Text weight={700}>{item.track}</Text>
              <Box>
                <Text size={isMobile ? "xsmall" : "small"}>{item.album}</Text>
              </Box>
            </Box>
          )}
          {item.artist && (
            <Box flex={{ grow: 0, shrink: 1 }} wrap={true}>
              <Text size={isMobile ? "small" : "medium"}>{item.artist}</Text>
            </Box>
          )}
          <Box
            direction={isMobile ? "row" : "column"}
            gap={isMobile ? "xsmall" : "none"}
            justify={isMobile ? "start" : "around"}
          >
            <Text size="xsmall">{format(item.timestamp, "p")}</Text>
            {item.dj && (
              <Text size="xsmall">
                {" "}
                {isMobile && <>•</>} {item.dj.username}
              </Text>
            )}
          </Box>
        </Box>
      )}
    />
  )
}

export default Playlist
