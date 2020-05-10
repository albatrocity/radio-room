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
      TYPING: {
        actions: ["setTyping"],
      },
    },
    type: "parallel",
    states: {
      admin: {
        id: "admin",
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
            exit: ["setDj"],
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
            type: "parallel",
            states: {
              editing: {
                initial: "none",
                states: {
                  none: {},
                  username: {},
                  meta: {
                    on: {
                      "": [
                        {
                          target: "none",
                          in: "#room.admin.notAdmin",
                        },
                      ],
                    },
                  },
                  artwork: {
                    on: {
                      "": [
                        {
                          target: "none",
                          in: "#room.admin.notAdmin",
                        },
                      ],
                    },
                  },
                  settings: {
                    on: {
                      "": [
                        {
                          target: "none",
                          in: "#room.admin.notAdmin",
                        },
                      ],
                    },
                  },
                },
                on: {
                  CLOSE_EDIT: ".none",
                  EDIT_USERNAME: ".username",
                  ADMIN_EDIT_META: {
                    target: ".meta",
                    in: "#room.admin.isAdmin",
                  },
                  ADMIN_EDIT_ARTWORK: {
                    target: ".artwork",
                    in: "#room.admin.isAdmin",
                  },
                  ADMIN_EDIT_SETTINGS: {
                    target: ".settings",
                    in: "#room.admin.isAdmin",
                  },
                },
              },
              modalViewing: {
                initial: "none",
                states: {
                  none: {},
                  listeners: {},
                },
                on: {
                  CLOSE_VIEWING: ".none",
                  VIEW_LISTENERS: ".listeners",
                },
              },
            },
          },
        },
      },
    },
  },
  {
    actions: {
      setTyping: assign((ctx, event) => {
        return { typing: event.data }
      }),
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
