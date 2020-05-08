import React, { useContext } from "react"
import { uniqBy, get, find, sortBy, reverse } from "lodash/fp"
import { Box, Text, Button } from "grommet"
import { Edit, MoreVertical, Microphone } from "grommet-icons"

import AuthContext from "../contexts/AuthContext"

const UserList = ({ users, onEditUser }) => {
  const { state: authState } = useContext(AuthContext)
  const typing = []

  const { currentUser } = authState
  const userList = reverse(
    sortBy(["isDj", "connectedAt"], uniqBy("userId", users))
  )

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
            elevation={x.isDj ? "small" : "none"}
            background={x.isDj ? "dark-2" : "transparent"}
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
                  : null
              }
              style={{ opacity: userTyping ? 1 : 0 }}
            >
              <MoreVertical color="light-4" size="small" />
            </Box>
            {x.isDj && (
              <Box>
                <Microphone size="14px" />
              </Box>
            )}
            <Box align="start" flex={{ grow: 1, shrink: 1 }}>
              <Text weight={x.isDj ? 700 : 500} size="small">
                {x.username || "anonymous"}
              </Text>
            </Box>
            {x.userId === get("userId", currentUser) && (
              <Box pad={{ horizontal: "xsmall" }}>
                <Button
                  plain
                  onClick={() => onEditUser()}
                  icon={<Edit size="small" />}
                />
              </Box>
            )}
          </Box>
        )
      })}
    </div>
  )
}

export default UserList
