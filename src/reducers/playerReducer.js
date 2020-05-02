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
    case "SET_META":
      return { ...state, meta: action.payload }
    default:
      return state
  }
}

export const initialState = {
  meta: {},
}
