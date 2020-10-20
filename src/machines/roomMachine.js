import { Machine, assign } from "xstate"

export const roomMachine = Machine(
  {
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
    },
    on: {
      LOGIN: {
        actions: ["setData", "dispatchReactions"],
      },
      PLAYLIST_DATA: {
        actions: ["setPlaylist"],
      },
      REACTIONS_DATA: {
        actions: ["setReactions", "dispatchReactions"],
      },
    },
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
              KICK_USER: {
                actions: ["kickUser"],
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
      disconnected: {},
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
    actions: {
      setData: assign({
        playlist: (context, event) => {
          return event.data.playlist
        },
        reactions: (context, event) => {
          return event.data.reactions
        },
      }),
      setPlaylist: assign({
        playlist: (context, event) => {
          return event.data
        },
      }),
      setReactions: assign({
        reactions: (context, event) => {
          return event.data.reactions
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
  }
)
