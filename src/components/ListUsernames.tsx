import React, { useContext } from "react"
import { Text } from "@chakra-ui/react"
import { compact } from "lodash/fp"
import { useSelector } from "@xstate/react"
import { GlobalStateContext } from "../contexts/global"
import { User } from "../types/User"

import { useCurrentUser } from "../state/authStore"

const usersSelector = (state) => state.context.users

const ListUsernames = ({ ids }: { ids: User["userId"][] }) => {
  const globalServices = useContext(GlobalStateContext)
  const users: User[] = useSelector(globalServices.usersService, usersSelector)
  const currentUser = useCurrentUser()
  const usernames = compact(
    users
      .filter((x: User) => ids.indexOf(x.userId) > -1)
      .map((x: User) => (currentUser.userId === x.userId ? "You" : x.username)),
  )

  return <Text fontSize="xsmall">{usernames.join(", ")}</Text>
}

export default ListUsernames
