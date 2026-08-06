import { setup, assign } from "xstate"
import { sortBy, uniqBy, reject, find } from "lodash/fp"
import type { AdminAssignablePersona } from "@repo/types"
import { User } from "../types/User"
import { subscribeById, unsubscribeById } from "../actors/socketActor"

// ============================================================================
// Types
// ============================================================================

export interface UsersContext {
  listeners: User[]
  dj: User | null
  users: User[]
  assignablePersonas: AdminAssignablePersona[]
  subscriptionId: string | null
}

type UsersEvent =
  | { type: "ACTIVATE" }
  | { type: "DEACTIVATE" }
  | { type: "USER_JOINED"; data: { users: User[] } }
  | { type: "USER_LEFT"; data: { users: User[] } }
  | { type: "USER_STATUS_CHANGED"; data: { user: User; oldStatus?: string } }
  | { type: "KICK_USER"; data: { users: User[] } }
  | { type: "PERSONA_ASSIGNED"; data: { users: User[] } }
  | { type: "PERSONA_REMOVED"; data: { users: User[] } }
  | {
      type: "PERSONA_DEFINITIONS_UPDATED"
      data: { assignablePersonas: AdminAssignablePersona[] }
    }
  | { type: "SET_USERS"; data: { users: User[] } }
  | { type: "SET_DATA"; data: { users: User[] } }
  | { type: "INIT"; data: { users: User[]; assignablePersonas?: AdminAssignablePersona[] } }

function derivePresence(users: User[]) {
  return {
    users,
    listeners: sortBy("connectedAt", uniqBy("userId", reject({ isDj: true }, users))),
    dj: find({ isDj: true }, users) ?? null,
  }
}

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
      subscribeById(id, {
        send: (event) => self.send(event),
        eventTypes: [
          "USER_JOINED",
          "USER_LEFT",
          "USER_STATUS_CHANGED",
          "KICK_USER",
          "PERSONA_ASSIGNED",
          "PERSONA_REMOVED",
          "PERSONA_DEFINITIONS_UPDATED",
          "SET_USERS",
          "SET_DATA",
          "INIT",
        ],
      })
      return { subscriptionId: id }
    }),
    unsubscribe: ({ context }) => {
      if (context.subscriptionId) {
        unsubscribeById(context.subscriptionId)
      }
    },
    setUsers: assign(({ event }) => {
      if ("data" in event && "users" in event.data && event.data.users) {
        return derivePresence(event.data.users)
      }
      return { users: [], listeners: [], dj: null }
    }),
    patchUserStatus: assign(({ context, event }) => {
      if (event.type !== "USER_STATUS_CHANGED") return {}
      const updated = event.data.user
      const users = context.users.map((u) =>
        u.userId === updated.userId ? { ...u, ...updated } : u,
      )
      const hasUser = users.some((u) => u.userId === updated.userId)
      return derivePresence(hasUser ? users : [...users, updated])
    }),
    setAssignablePersonas: assign({
      assignablePersonas: ({ event }) => {
        if (event.type === "INIT" && event.data.assignablePersonas) {
          return event.data.assignablePersonas
        }
        if (event.type === "PERSONA_DEFINITIONS_UPDATED") {
          return event.data.assignablePersonas
        }
        return []
      },
    }),
    resetUsers: assign({
      users: () => [],
      listeners: () => [],
      dj: () => null,
      assignablePersonas: () => [],
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
    assignablePersonas: [],
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
        USER_STATUS_CHANGED: {
          actions: ["patchUserStatus"],
        },
        KICK_USER: {
          actions: ["setUsers"],
        },
        PERSONA_ASSIGNED: {
          actions: ["setUsers"],
        },
        PERSONA_REMOVED: {
          actions: ["setUsers"],
        },
        PERSONA_DEFINITIONS_UPDATED: {
          actions: ["setAssignablePersonas"],
        },
        SET_USERS: {
          actions: ["setUsers"],
        },
        SET_DATA: {
          actions: ["setUsers"],
        },
        INIT: {
          actions: ["setUsers", "setAssignablePersonas"],
        },
      },
    },
  },
})
