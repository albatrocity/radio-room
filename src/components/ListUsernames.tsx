import React from "react"
import { Text } from "@chakra-ui/react"
import { compact } from "lodash/fp"
import { User } from "../types/User"

import { useCurrentUser } from "../state/authStore"
import { useUsers } from "../state/usersStore"

const ListUsernames = ({ ids }: { ids: User["userId"][] }) => {
  const users: User[] = useUsers()
  const currentUser = useCurrentUser()
  const usernames = compact(
    users
      .filter((x: User) => ids.indexOf(x.userId) > -1)
      .map((x: User) => (currentUser.userId === x.userId ? "You" : x.username)),
  )

  return <Text fontSize="xsmall">{usernames.join(", ")}</Text>
}

export default ListUsernames
