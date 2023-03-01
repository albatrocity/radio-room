import { assign, send, createMachine } from "xstate"
import socketService from "../lib/socketService"

export const roomMachine = createMachine(
  {
    predictableActionArguments: true,
    id: "room",
    initial: "connected",
    context: {
      playlist: [],
      reactions: {
        track: {},
        message: {},
      },
      reactionPickerRef: null,
      reactTo: null,
      isDeputyDj: false,
    },
    on: {
      LOGIN: {
        actions: ["setData"],
      },
      PLAYLIST: {
        actions: ["setPlaylist"],
      },
      INIT: {
        actions: ["setData"],
      },
      //   {
      //     target: "deputyDjaying.isDj",
      //     actions: ["always", "setData"],
      //     cond: "isDeputyDj",
      //   },
      // ],
    },
    invoke: [
      {
        id: "socket",
        src: (ctx, event) => socketService,
      },
    ],
    type: "parallel",
    states: {
      reactionPicker: {
        id: "reactionPicker",
        initial: "inactive",
        on: {
          SELECT_REACTION: {
            target: ".inactive",
            actions: ["toggleReaction"],
          },
        },
        states: {
          active: {
            entry: ["setReaction"],
            on: {
              TOGGLE_REACTION_PICKER: "inactive",
            },
          },
          inactive: {
            entry: ["clearReaction"],
            on: {
              TOGGLE_REACTION_PICKER: "active",
            },
          },
        },
      },
      playlist: {
        id: "playlist",
        initial: "inactive",
        states: {
          active: {
            on: {
              TOGGLE_PLAYLIST: "inactive",
            },
          },
          inactive: {
            on: {
              TOGGLE_PLAYLIST: "active",
            },
          },
        },
      },
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
      isDeputyDj: (ctx, event) => {
        return ctx.isDeputyDj || event.data?.currentUser?.isDeputyDj
      },
    },
    actions: {
      always: () => {
        console.log("ALWAYS")
      },
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
      setData: assign({
        playlist: (context, event) => {
          return event.data.playlist
        },
        reactions: (context, event) => {
          return event.data.reactions
        },
        isDeputyDj: (context, event) => {
          return event.data.currentUser.isDeputyDj
        },
      }),
      setPlaylist: assign({
        playlist: (context, event) => {
          return event.data
        },
      }),
      setReaction: assign({
        reactionPickerRef: (ctx, event) => {
          return event.dropRef
        },
        reactTo: (ctx, event) => event.reactTo,
      }),
      clearReaction: assign({
        reactionPickerRef: null,
        reactTo: null,
      }),
    },
  },
)
