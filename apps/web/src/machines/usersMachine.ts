import { setup, assign } from "xstate"
import { sortBy, uniqBy, reject, find } from "lodash/fp"
import { User } from "../types/User"
import { subscribeById, unsubscribeById } from "../actors/socketActor"

// ============================================================================
// Types
// ============================================================================

export interface UsersContext {
  listeners: User[]
  dj: User | null
  users: User[]
  subscriptionId: string | null
}

type UsersEvent =
  | { type: "ACTIVATE" }
  | { type: "DEACTIVATE" }
  | { type: "USER_JOINED"; data: { users: User[] } }
  | { type: "USER_LEFT"; data: { users: User[] } }
  | { type: "KICK_USER"; data: { users: User[] } }
  | { type: "SET_USERS"; data: { users: User[] } }
  | { type: "SET_DATA"; data: { users: User[] } }
  | { type: "INIT"; data: { users: User[] } }

// ============================================================================
// Machine
// ============================================================================

let subscriptionCounter = 0

export const usersMachine = setup({
  types: {
    context: {} as UsersContext,
    events: {} as UsersEvent,
  },
  actions: {
    subscribe: assign(({ self }) => {
      const id = `users-${self.id}-${++subscriptionCounter}`
      subscribeById(id, { send: (event) => self.send(event) })
      return { subscriptionId: id }
    }),
    unsubscribe: ({ context }) => {
      if (context.subscriptionId) {
        unsubscribeById(context.subscriptionId)
      }
    },
    setUsers: assign({
      users: ({ event }) => {
        if ("data" in event && "users" in event.data) {
          return event.data.users
        }
        return []
      },
      listeners: ({ event }) => {
        if ("data" in event && "users" in event.data) {
          return sortBy(
            "connectedAt",
            uniqBy("userId", reject({ isDj: true }, event.data.users)),
          )
        }
        return []
      },
      dj: ({ event }) => {
        if ("data" in event && "users" in event.data) {
          return find({ isDj: true }, event.data.users) ?? null
        }
        return null
      },
    }),
    resetUsers: assign({
      users: () => [],
      listeners: () => [],
      dj: () => null,
      subscriptionId: () => null,
    }),
  },
}).createMachine({
  id: "users",
  initial: "idle",
  context: {
    users: [],
    dj: null,
    listeners: [],
    subscriptionId: null,
  },
  states: {
    // Idle state - not subscribed to socket events
    idle: {
      on: {
        ACTIVATE: "active",
      },
    },
    // Active state - subscribed to socket events
    active: {
      entry: ["subscribe"],
      exit: ["unsubscribe"],
      on: {
        DEACTIVATE: {
          target: "idle",
          actions: ["resetUsers"],
        },
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
    },
  },
})
