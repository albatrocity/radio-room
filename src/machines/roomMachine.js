import { actions, sendParent, Machine, assign } from "xstate"
import session from "sessionstorage"
import { v4 as uuidv4 } from "uuid"
import { get, isEqual, uniqBy } from "lodash/fp"

import generateAnonName from "../lib/generateAnonName"
import socket from "../lib/socket"
import { SESSION_ID, SESSION_USERNAME } from "../constants"

export const roomMachine = Machine(
  {
    id: "room",
    initial: "initial",
    context: {
      messages: [],
      users: [],
      typing: [],
      meta: {},
      currentUser: {},
      isNewUser: false,
      editingUser: false,
      viewingListeners: false,
      adminPanel: false,
    },
    on: {
      USER_ADDED: {
        actions: ["setUsers"],
      },
      REMOVE_USER: {
        actions: ["setUsers"],
      },
      USER_DISCONNECTED: {
        actions: ["disconnectUser"],
      },
      TYPING: {
        actions: ["setTyping"],
      },
      NEW_MESSAGE: {
        actions: ["addMessage"],
      },
      START_TYPING: {
        actions: ["startTyping"],
      },
      STOP_TYPING: {
        actions: ["stopTyping"],
      },
      SEND_MESSAGE: {
        actions: ["sendMessage"],
      },
      CHANGE_USERNAME: {
        actions: ["setCurrentUser"]
      },
    },
    states: {
      initial: {
        on: {
          SETUP: {
            actions: ["setCurrentUser"],
            target: "connecting",
          },
        },
      },
      connecting: {
        entry: ["setCurrentUser"],
        invoke: {
          src: _ => cb => {
            socket.on("init", payload => {
              console.log('INIT');
              cb({ type: "LOGIN", payload })
            })
            return
          },
        },
        on: {
          LOGIN: {
            target: "connected",
            actions: ["setUsers", "setMeta", "setMessages"],
          },
        },
      },
      connected: {
        invoke: {
          src: _ => cb => {
            socket.on("user joined", payload => {
              cb({ type: "USER_ADDED", payload })
            })
            socket.on("user left", payload => {
              cb({ type: "REMOVE_USER", payload })
            })
            socket.on("new message", payload => {
              console.log("new message socket", payload)
              cb({ type: "NEW_MESSAGE", payload })
            })
            socket.on("typing", payload => {
              cb({ type: "TYPING", payload: { typing: payload } })
            })
          },
        },
      },
      willRetry: {
        after: { 2000: "connecting" },
      },
    },
  },
  {
    actions: {
      setMeta: assign((context, event) => {
        return { meta: event.meta }
      }),
      setMessages: assign((context, event) => {
        return { messages: event.payload.messages }
      }),
      sayHello: () => {
        console.log("YOU ARE LOGGING IN BECAUSE A TRANSITION IS HAPPENING")
      },
      startTyping: (context, event) => {
        socket.emit("typing")
      },
      stopTyping: (context, event) => {
        socket.emit("stop typing")
      },
      setTyping: assign({
        typing: (context, event) => {
          return event.payload.typing
        },
      }),
      setUsers: assign({
        users: (context, event) => {
          return event.payload.users
        },
      }),
      disconnectUser: (context, event) => {
        socket.emit("disconnect", context.currentUser.userId)
      },
      sendMessage: (context, event) => {
        socket.emit("new message", event.payload)
      },
      addMessage: assign({
        messages: (context, event) => {
          return [...context.messages, event.payload]
        },
      }),
      setCurrentUser: assign((context, event) => {
        console.log("set current user event", event)
        const isNewUser = !session.getItem(SESSION_ID)
        assign({
          isNewUser
        })
        const userId =
          get("payload.userId", event) ||
          session.getItem(SESSION_ID) ||
          uuidv4()
        const username =
          get("payload.username", event) ||
          session.getItem(SESSION_USERNAME) ||
          generateAnonName()

        session.setItem(SESSION_USERNAME, username)
        session.setItem(SESSION_ID, userId)
        socket.emit("login", { username, userId })
        return {
          currentUser: { username, userId },
          isNewUser: isNewUser,
        }
      }),
    },
  }
)
