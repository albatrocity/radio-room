import React, { useContext, memo } from "react"
import { Box, Text, Anchor, Heading } from "grommet"
import Linkify from "react-linkify"
import nl2br from "react-nl2br"
import { Currency } from "grommet-icons"
import styled from "styled-components"
import { get, isEqual } from "lodash/fp"
import { Edit } from "grommet-icons"

import AuthContext from "../contexts/AuthContext"
import ListItemUser from "./ListItemUser"

const StyledText = styled(Text)`
  a {
    color: ${p => p.theme.global.colors[p.theme.anchor.color.dark]};
  }
`

const UserList = ({ listeners, onEditUser, dj, typing, onEditSettings }) => {
  const { state: authState } = useContext(AuthContext)

  const { currentUser } = authState
  const currentDj = isEqual(
    get("currentUser.userId", authState),
    get("userId", dj)
  )

  return (
    <div>
      {dj && (
        <Box margin={{ bottom: "small" }}>
          <Heading level={3} margin={{ bottom: "xsmall", top: "none" }}>
            DJ
          </Heading>
          <ListItemUser
            user={dj}
            currentUser={currentUser}
            onEditUser={onEditUser}
            typing={typing}
          />

          {currentDj && !dj.extraInfo && !dj.donationURL && (
            <Box
              background="dark-1"
              pad="small"
              elevation="medium"
              border={{ side: "vertical" }}
            >
              <Box
                margin="xsmall"
                pad="xsmall"
                direction="row"
                border={{ side: "all", style: "dashed" }}
                align="center"
                gap="xsmall"
                onClick={() => onEditSettings()}
              >
                <Text size="small">
                  Add info here, like links to anything you're promoting and a
                  donation link.
                </Text>
                <Edit />
              </Box>
            </Box>
          )}

          {(dj.extraInfo || dj.donationURL) && (
            <Box
              background="dark-1"
              pad="small"
              elevation="medium"
              border={{ side: "vertical" }}
            >
              {dj.donationURL !== "" && (
                <Text truncate={true}>
                  <Anchor
                    icon={<Currency />}
                    href={dj.donationURL}
                    label={dj.donationURL}
                  />
                </Text>
              )}

              {dj.extraInfo !== "" && (
                <Linkify>
                  <StyledText size="small">{nl2br(dj.extraInfo)}</StyledText>
                </Linkify>
              )}
            </Box>
          )}
        </Box>
      )}
      <Box>
        <Heading level={3} margin={{ bottom: "xsmall", top: "none" }}>
          Listeners <Text size="small">({listeners.length})</Text>
        </Heading>
        {listeners.map(x => {
          return (
            <ListItemUser
              key={x.userId}
              user={x}
              typing={typing}
              currentUser={currentUser}
              onEditUser={onEditUser}
            />
          )
        })}
      </Box>
    </div>
  )
}

export default memo(UserList)
