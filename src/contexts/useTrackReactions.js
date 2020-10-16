import React, { useMemo, useReducer, useContext, createContext } from "react"

const TrackReactionsContext = createContext({})

const TrackReactionsReducer = (state, action) => {
  const { payload } = action
  switch (action.type) {
    case "SET":
      return { ...state, reactions: payload.track }
    default:
      return state
  }
}

const initialState = {
  reactions: {},
}

function TrackReactionsProvider(props) {
  const [state, dispatch] = useReducer(
    TrackReactionsReducer,
    props.initialState || initialState
  )
  const value = useMemo(() => [state, dispatch], [state])
  return <TrackReactionsContext.Provider value={value} {...props} />
}

function useTrackReactions() {
  const context = useContext(TrackReactionsContext)
  if (!context) {
    throw new Error(
      "useTrackReactions must be used within a TrackReactionsProvider"
    )
  }
  const [state, dispatch] = context

  return {
    state,
    dispatch,
  }
}

export { TrackReactionsProvider, useTrackReactions }
