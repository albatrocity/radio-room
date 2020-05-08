import { Machine, assign } from "xstate"

export const roomMachine = Machine(
  {
    id: "room",
    initial: "connected",
    context: {
      users: [],
      typing: [],
    },
    on: {
      USER_ADDED: {
        actions: ["setUsers", "checkDj"],
      },
      REMOVE_USER: {
        actions: ["setUsers"],
      },
      LOGIN: {
        actions: ["setData"],
      },
    },
    type: "parallel",
    states: {
      admin: {
        id: "roomAdmin",
        initial: "notAdmin",
        states: {
          isAdmin: {
            on: {
              DEACTIVATE_ADMIN: "notAdmin",
            },
          },
          notAdmin: {
            on: {
              ACTIVATE_ADMIN: "isAdmin",
            },
          },
        },
      },
      djaying: {
        initial: "notDj",
        states: {
          isDj: {
            entry: ["setDj"],
            on: {
              "": [
                {
                  target: "notDj",
                  in: "#room.admin.notAdmin",
                },
              ],
              END_DJ_SESSION: "notDj",
            },
          },
          notDj: {
            on: {
              START_DJ_SESSION: { target: "isDj", in: "#room.admin.isAdmin" },
            },
          },
        },
      },
      connected: {
        activities: ["setupListeners"],
        initial: "participating",
        states: {
          participating: {
            on: {
              ADMINISTRATE: {
                target: "administrating",
                in: "#room.admin.isAdmin",
              },
              VIEW_LISTENERS: {
                target: "#room.connected.modalViewing.listeners",
                actions: [() => console.log("listeners")],
              },
            },
          },
          administrating: {
            on: {
              "": [
                {
                  target: "participating",
                  in: "#room.admin.notAdmin",
                },
              ],
              CLOSE_ADMIN: "participating",
            },
          },
          editing: {
            initial: "none",
            states: {
              none: {},
              username: {},
            },
            on: {
              CLOSE_EDIT: "participating",
            },
          },
          modalViewing: {
            initial: "none",
            states: {
              none: {},
              listeners: {},
            },
            on: {
              CLOSE_VIEWING: "participating",
            },
          },
        },
        on: {
          EDIT_USERNAME: "#room.connected.editing.username",
        },
      },
    },
  },
  {
    actions: {
      setUsers: assign({
        users: (context, event) => {
          return event.data.users
        },
      }),
      setData: assign({
        users: (context, event) => {
          return event.data.users
        },
      }),
    },
  }
)
