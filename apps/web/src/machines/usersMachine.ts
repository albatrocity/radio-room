import { setup, assign } from "xstate"
import { sortBy, uniqBy, reject, find } from "lodash/fp"
import { User } from "../types/User"

interface Context {
  listeners: User[]
  dj: User | null
  users: User[]
}

type UsersEvent =
  | { type: "USER_JOINED"; data: { users: User[] } }
  | { type: "USER_LEFT"; data: { users: User[] } }
  | { type: "KICK_USER"; data: { users: User[] } }
  | { type: "SET_USERS"; data: { users: User[] } }
  | { type: "SET_DATA"; data: { users: User[] } }
  | { type: "INIT"; data: { users: User[] } }

export const usersMachine = setup({
  types: {
    context: {} as Context,
    events: {} as UsersEvent,
  },
  actions: {
    setUsers: assign({
      users: ({ event }) => {
        return event.data.users
      },
      listeners: ({ event }) => {
        return sortBy(
          "connectedAt",
          uniqBy("userId", reject({ isDj: true }, event.data.users)),
        )
      },
      dj: ({ event }) => find({ isDj: true }, event.data.users) ?? null,
    }),
  },
}).createMachine({
  id: "users",
  initial: "connected",
  context: {
    users: [],
    dj: null,
    listeners: [],
  },
  on: {
    USER_JOINED: {
      actions: ["setUsers"],
    },
    USER_LEFT: {
      actions: ["setUsers"],
    },
    KICK_USER: {
      actions: ["setUsers"],
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
})
