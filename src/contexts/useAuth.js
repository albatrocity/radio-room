import React, { useMemo, useReducer, useContext, createContext } from "react"
import { sortBy, uniqBy, reject, find } from "lodash/fp"

const AuthContext = createContext({})

function AuthProvider({ value, ...rest }) {
  const memoVal = useMemo(() => value, value)
  return <AuthContext.Provider value={value} {...rest} />
}

function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within a AuthProvider")
  }
  return context
}

export { AuthProvider, useAuth }
