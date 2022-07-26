import React, { useContext } from "react"
import { Text } from "grommet"
import { compact } from "lodash/fp"
import { useSelector } from "@xstate/react"
import { GlobalStateContext } from "../contexts/global"

const usersSelector = (state) => state.context.users
const currentUserSelector = (state) => state.context.currentUser

const ListUsernames = ({ ids }) => {
  const globalServices = useContext(GlobalStateContext)
  const users = useSelector(globalServices.usersService, usersSelector)
  const currentUser = useSelector(
    globalServices.authService,
    currentUserSelector,
  )
  const usernames = compact(
    users
      .filter((x) => ids.indexOf(x.userId) > -1)
      .map((x) => (currentUser.userId === x.userId ? "You" : x.username)),
  )

  return <Text size="xsmall">{usernames.join(", ")}</Text>
}

export default ListUsernames
