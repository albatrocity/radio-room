import React, { useMemo, useReducer, useContext, createContext } from "react"

const ChatReactionsContext = createContext({})

const ChatReactionsReducer = (state, action) => {
  const { payload } = action
  switch (action.type) {
    case "SET":
      return { ...state, reactions: payload.message }
    default:
      return state
  }
}

const initialState = {
  reactions: {
    track: {},
    message: {},
  },
}

function ChatReactionsProvider(props) {
  const [state, dispatch] = useReducer(
    ChatReactionsReducer,
    props.initialState || initialState
  )
  const value = useMemo(() => [state, dispatch], [state])
  return <ChatReactionsContext.Provider value={value} {...props} />
}

function useChatReactions() {
  const context = useContext(ChatReactionsContext)
  if (!context) {
    throw new Error(
      "useShopifyProducts must be used within a ChatReactionsProvider"
    )
  }
  return context
}

export { ChatReactionsProvider, useChatReactions }
