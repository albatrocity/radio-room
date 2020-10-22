import React from "react"
import { Text } from "grommet"
import { map, filter, compact, get } from "lodash/fp"
import { useUsers } from "../contexts/useUsers"

const ListUsernames = ({ ids }) => {
  const [state] = useUsers()
  const { users } = state.context
  const usernames = compact(
    map(
      x =>
        get("context.currentUser.userId", state) === get("userId", x)
          ? "You"
          : get("username", x),
      filter(x => ids.indexOf(x.userId) > -1, users)
    )
  )
  return <Text size="xsmall">{usernames.join(", ")}</Text>
}

export default ListUsernames
