import {
  includes,
  reject,
  concat,
  get,
  map,
  compact,
  reduce,
  replace,
  isEqual,
} from "lodash/fp"
import queryString from "query-string"

export default (state, action) => {
  switch (action.type) {
    case "ADD_USER":
      return {
        ...state,
        users: get("payload.users", action),
      }
    case "REMOVE_USER":
      return {
        ...state,
        users: get("payload.users", action),
      }
    case "SET_META":
      return { ...state, meta: action.payload }
    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.payload] }
    default:
      return state
  }
}

export const initialState = {
  listenerCount: 0,
  messages: [],
  users: [],
  meta: {},
}
