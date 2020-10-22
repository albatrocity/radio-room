import React, { useMemo, useReducer, useContext, createContext } from "react"
import { sortBy, uniqBy, reject, find } from "lodash/fp"

const UsersContext = createContext({})

function UsersProvider({ value, ...rest }) {
  const memoVal = useMemo(() => value, value)
  return <UsersContext.Provider value={value} {...rest} />
}

function useUsers() {
  const context = useContext(UsersContext)
  if (!context) {
    throw new Error("useUsers must be used within a UsersProvider")
  }
  return context
}

export { UsersProvider, useUsers }
