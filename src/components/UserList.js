import React, { useContext } from "react"
import { uniqBy, get, find } from "lodash/fp"
import { Box, Heading, Text, Button, ResponsiveContext } from "grommet"
import { Edit, MoreVertical } from "grommet-icons"

import RoomContext from "../contexts/RoomContext"

const UserList = () => {
  const {
    state: { typing, currentUser, users },
    dispatch,
  } = useContext(RoomContext)
  const userList = uniqBy("userId", users)

  return (
    <div>
      {userList.map(x => {
        const userTyping = find({ userId: get("userId", x) }, typing)
        return (
          <Box
            direction="row"
            align="center"
            key={x.userId}
            justify="between"
            border={{ side: "bottom" }}
            gap="xsmall"
            pad={{ vertical: "xsmall" }}
          >
            <Box
              animation={
                userTyping
                  ? {
                      type: "pulse",
                      delay: 0,
                      duration: 200,
                      size: "large",
                    }
                  : "none"
              }
              style={{ opacity: userTyping ? 1 : 0 }}
            >
              <MoreVertical color="light-4" size="small" />
            </Box>
            <Box align="start" flex={{ grow: 1, shrink: 1 }}>
              <Text size="small">{x.username || "anonymous"}</Text>
            </Box>
            {x.userId === get("userId", currentUser) && (
              <Button
                plain
                onClick={() => dispatch({ type: "EDIT_USER" })}
                icon={<Edit size="small" />}
              />
            )}
          </Box>
        )
      })}
    </div>
  )
}

export default UserList
