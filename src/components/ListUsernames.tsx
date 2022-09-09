import React, { useContext } from "react"
import { Text } from "grommet"
import { compact } from "lodash/fp"
import { useSelector } from "@xstate/react"
import { GlobalStateContext } from "../contexts/global"
import { User } from "../types/User"

const usersSelector = (state) => state.context.users
const currentUserSelector = (state) => state.context.currentUser

const ListUsernames = ({ ids }: { ids: User[] }) => {
  const globalServices = useContext(GlobalStateContext)
  const users: User[] = useSelector(globalServices.usersService, usersSelector)
  const currentUser = useSelector(
    globalServices.authService,
    currentUserSelector,
  )
  const usernames = compact(
    users
      .filter((x: User) => ids.indexOf(x.userId) > -1)
      .map((x: User) => (currentUser.userId === x.userId ? "You" : x.username)),
  )

  return <Text size="xsmall">{usernames.join(", ")}</Text>
}

export default ListUsernames
