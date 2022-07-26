import React, { useContext } from "react"
import { Text } from "grommet"
import { map, filter, compact, get } from "lodash/fp"
import { useSelector } from "@xstate/react"
import { GlobalServicesContext } from "../contexts/global"

const usersSelector = (state) => state.context.users

const ListUsernames = ({ ids }) => {
  const globalServices = useContext(GlobalServicesContext)
  const users = useSelector(globalServices.usersService, usersSelector)
  const usernames = compact(
    map(
      (x) =>
        get("context.currentUser.userId", state) === get("userId", x)
          ? "You"
          : get("username", x),
      filter((x) => ids.indexOf(x.userId) > -1, users),
    ),
  )
  return <Text size="xsmall">{usernames.join(", ")}</Text>
}

export default ListUsernames
