import React, { useMemo, useReducer, useContext, createContext } from "react"
import { sortBy, uniqBy, reject, find } from "lodash/fp"

const UsersContext = createContext({})

const UsersReducer = (state, action) => {
  const { payload } = action
  switch (action.type) {
    case "SET":
      return {
        ...state,
        users: payload,
        listeners: sortBy(
          "connectedAt",
          uniqBy("userId", reject({ isDj: true }, payload))
        ),
        dj: find({ isDj: true }, payload),
      }
    case "SET_TYPING":
      return { ...state, typing: payload }
    default:
      return state
  }
}

const initialState = {
  users: [],
  listeners: [],
  dj: null,
  typing: [],
}

function UsersProvider(props) {
  const [state, dispatch] = useReducer(
    UsersReducer,
    props.initialState || initialState
  )
  const value = useMemo(() => [state, dispatch], [state])
  return <UsersContext.Provider value={value} {...props} />
}

function useUsers() {
  const context = useContext(UsersContext)
  if (!context) {
    throw new Error("useUsers must be used within a UsersProvider")
  }
  const [state, dispatch] = context

  return {
    state,
    dispatch,
  }
}

export { UsersProvider, useUsers }
