import React, { useMemo, useReducer, useContext, createContext } from "react"
import { sortBy, uniqBy, reject, find } from "lodash/fp"

const ReactionsContext = createContext({})

function ReactionsProvider({ value, ...rest }) {
  const memoVal = useMemo(() => value, value)
  return <ReactionsContext.Provider value={value} {...rest} />
}

function useReactions() {
  const context = useContext(ReactionsContext)
  if (!context) {
    throw new Error("useReactions must be used within a ReactionsProvider")
  }
  return context
}

export { ReactionsProvider, useReactions }
