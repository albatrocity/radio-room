import { React, useContext } from "react"
import session from "sessionstorage"
import { v4 as uuidv4 } from "uuid"
import { get, map, compact, isEqual, uniqBy } from "lodash/fp"

import { SESSION_ID, SESSION_USERNAME } from "../constants"
import generateAnonName from "../lib/generateAnonName"
import socket from "../lib/socket"

export default (state, action) => {
  let userId, username

  switch (action.type) {
    case "USER_ADDED":
      return {
        ...state,
        users: get("payload.users", action),
      }
    case "REMOVE_USER":
      return {
        ...state,
        users: get("payload.users", action),
      }
    case "USER_DISCONNECTED":
      socket.emit("disconnect", state.currentUser.userId)
      return state
    case "INIT":
      return {
        ...state,
        users: uniqBy("userId", get("payload.users", action)) || [],
        messages: get("payload.messages", action) || [],
      }
    case "LOGIN":
      const isNewUser = !session.getItem(SESSION_ID)
      userId =
        get("payload.username", action) ||
        session.getItem(SESSION_ID) ||
        uuidv4()
      username =
        get("payload.userId", action) ||
        session.getItem(SESSION_USERNAME) ||
        generateAnonName()

      session.setItem(SESSION_USERNAME, username)
      session.setItem(SESSION_ID, userId)
      socket.emit("login", { username, userId })
      return {
        ...state,
        users: uniqBy("userId", get("payload.users", action)) || [],
        currentUser: { username, userId },
        isNewUser: isNewUser,
      }
    case "EDIT_USER":
      return { ...state, editingUser: true, viewingListeners: false }
    case "CHANGE_USERNAME":
      session.setItem(SESSION_USERNAME, action.payload)
      socket.emit("change username", {
        userId: get("currentUser.userId", state),
        username: action.payload,
      })
      return {
        ...state,
        isNewUser: false,
        editingUser: false,
        viewingListeners: false,
      }
    case "CLOSE_USERNAME_FORM":
      return { ...state, isNewUser: false, editingUser: false }
    case "SET_META":
      return { ...state, meta: action.payload }
    case "NEW_MESSAGE":
      return { ...state, messages: [...state.messages, action.payload] }
    case "TYPING":
      return { ...state, typing: action.payload }
    case "VIEW_LISTENERS":
      return { ...state, viewingListeners: action.payload }
    case "ADMIN_PANEL":
      return { ...state, adminPanel: action.payload }
    default:
      return state
  }
}

export const initialState = {
  listenerCount: 0,
  messages: [],
  users: [],
  typing: [],
  meta: {},
  currentUser: {},
  isNewUser: false,
  editingUser: false,
  viewingListeners: false,
  adminPanel: false,
}
