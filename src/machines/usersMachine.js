import { Machine, assign, send } from "xstate"
import socketService from "../lib/socketService"
import eventBus from "../lib/eventBus"
import { sortBy, uniqBy, reject, find, get } from "lodash/fp"

export const usersMachine = Machine(
  {
    id: "users",
    initial: "connected",
    context: {
      users: [],
      dj: null,
      listeners: [],
      currentUser: {},
    },
    invoke: [
      {
        id: "socket",
        src: (ctx, event) => socketService,
      },
    ],
    on: {
      USER_JOINED: {
        actions: ["setUsers", "checkDj"],
      },
      USER_LEFT: {
        actions: ["setUsers"],
      },
      SET_CURRENT_USER: {
        actions: ["setCurrentUser"],
      },
      LOGIN: {
        actions: ["setUsers", "setCurrentUser"],
      },
      KICK_USER: {
        actions: ["kickUser"],
      },
      SET_USERS: {
        actions: ["setUsers"],
      },
      SET_DATA: {
        actions: ["setUsers"],
      },
      INIT: {
        actions: ["setUsers"],
      },
    },
    states: {
      connected: {},
    },
  },
  {
    actions: {
      log: (context, event) =>
        console.log("usersMachine event", context, event),
      kickUser: (context, event) => {
        // send("kick user", { to: "socket" })
      },
      checkDj: (context, event) => {
        const isDj = get(
          "isDj",
          find({ userId: context.currentUser.userId }, event.data.users)
        )
        if (!isDj) {
          // send("END_DJ_SESSION")
        }
      },
      setCurrentUser: assign({
        currentUser: (context, event) => {
          return event.data.currentUser
        },
      }),
      setUsers: assign({
        currentUser: (context, event) => {
          console.log("SET USERS", event)
          return event.data.currentUser
            ? event.data.currentUser
            : context.currentUser
        },
        users: (context, event) => {
          return event.data.users
        },
        listeners: (context, event) => {
          return sortBy(
            "connectedAt",
            uniqBy("userId", reject({ isDj: true }, event.data.users))
          )
        },
        dj: (context, event) => find({ isDj: true }, event.data.users),
      }),
    },
  }
)
