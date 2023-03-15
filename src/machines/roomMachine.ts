import { send, createMachine } from "xstate"
import socketService from "../lib/socketService"

export const roomMachine = createMachine(
  {
    predictableActionArguments: true,
    id: "room",
    initial: "connected",
    on: {
      LOGIN: {
        actions: ["setData"],
      },
      INIT: {
        actions: ["setData"],
      },
    },
    invoke: [
      {
        id: "socket",
        src: () => socketService,
      },
    ],
    type: "parallel",
    states: {
      admin: {
        id: "admin",
        initial: "notAdmin",
        states: {
          isAdmin: {
            on: {
              DEACTIVATE_ADMIN: "notAdmin",
              DEPUTIZE_DJ: {
                target: ".",
                actions: ["deputizeDj"],
              },
            },
          },
          notAdmin: {
            on: {
              ACTIVATE_ADMIN: {
                target: "isAdmin",
                actions: ["adminActivated"],
              },
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
              always: [
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
      deputyDjaying: {
        initial: "notDj",
        on: {
          INIT: [
            {
              target: "deputyDjaying.isDj",
              actions: ["setData"],
              cond: "isDeputyDj",
            },
          ],
        },
        states: {
          isDj: {
            on: {
              END_DEPUTY_DJ_SESSION: "notDj",
            },
          },
          notDj: {
            on: {
              START_DEPUTY_DJ_SESSION: "isDj",
            },
          },
        },
      },
      disconnected: {},
      unauthorized: {},
      connected: {
        initial: "participating",
        on: {
          always: {
            target: "deputyDjaying.isDj",
            actions: ["always"],
          },
        },
        states: {
          participating: {
            type: "parallel",
            states: {
              editing: {
                initial: "none",
                states: {
                  none: {},
                  username: {},
                  preferences: {},
                  queue: {},
                  meta: {
                    on: {
                      always: [
                        {
                          target: "none",
                          in: "#room.admin.notAdmin",
                        },
                      ],
                      FIX_META: {
                        actions: ["fixMeta"],
                      },
                    },
                  },
                  artwork: {
                    on: {
                      always: [
                        {
                          target: "none",
                          in: "#room.admin.notAdmin",
                        },
                      ],
                      SET_COVER: {
                        actions: ["setArtwork"],
                      },
                    },
                  },
                  bookmarks: {
                    on: {
                      always: [
                        {
                          target: "none",
                          in: "#room.admin.notAdmin",
                        },
                      ],
                    },
                  },
                  settings: {
                    on: {
                      always: [
                        {
                          target: "none",
                          in: "#room.admin.notAdmin",
                        },
                      ],
                      SET_SETTINGS: {
                        actions: ["setSettings"],
                      },
                    },
                  },
                  listenerSettings: {},
                },
                on: {
                  CLOSE_EDIT: ".none",
                  EDIT_USERNAME: ".username",
                  EDIT_SETTINGS: ".preferences",
                  EDIT_QUEUE: ".queue",
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
                  ADMIN_BOOKMARKS: {
                    target: ".bookmarks",
                    in: "#room.admin.isAdmin",
                  },
                  ADMIN_CLEAR_PLAYLIST: {
                    actions: ["clearPlaylist"],
                  },
                  DISCONNECT: {
                    target: "#room.disconnected",
                    actions: ["setRetry"],
                  },
                },
              },
              modalViewing: {
                initial: "none",
                states: {
                  none: {},
                  listeners: {},
                  help: {},
                },
                on: {
                  CLOSE_VIEWING: ".none",
                  VIEW_LISTENERS: ".listeners",
                  VIEW_HELP: ".help",
                },
              },
            },
          },
        },
      },
    },
  },
  {
    guards: {
      isDeputyDj: (_ctx, event) => {
        return event.data?.currentUser?.isDeputyDj
      },
    },
    actions: {
      deputizeDj: send(
        (_ctx, event) => {
          return {
            type: "dj deputize user",
            data: event.userId,
          }
        },
        {
          to: "socket",
        },
      ),
      fixMeta: send(
        (_ctx, event) => {
          return {
            type: "fix meta",
            data: event.data,
          }
        },
        {
          to: "socket",
        },
      ),
      setArtwork: send(
        (_ctx, event) => {
          return {
            type: "set cover",
            data: event.data,
          }
        },
        {
          to: "socket",
        },
      ),
      setSettings: send(
        (_ctx, event) => {
          return {
            type: "settings",
            data: event.data,
          }
        },
        {
          to: "socket",
        },
      ),
    },
  },
)
