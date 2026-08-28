import { assign, setup } from "xstate"

import { getIsAdmin } from "../actors/authActor"
import { emitToSocket } from "../actors/socketActor"
import { canAddToQueue as canDjAddToQueue } from "../actors/djActor"

type Context = {
  /**
   * Physical Media item to open in Add to Queue → Browse (ADR 0099), set when
   * the inventory deep-links into a held record.
   */
  queueBrowseMediaKey: string | null
}

export type Event =
  | { type: "EDIT_USERNAME" }
  | { type: "EDIT_QUEUE"; browseMediaKey?: string }
  | { type: "EDIT_SETTINGS" }
  | { type: "VIEW_HELP" }
  | { type: "VIEW_BOOKMARKS" }
  | { type: "VIEW_LISTENERS" }
  | { type: "VIEW_SCHEDULE" }
  | { type: "VIEW_GAME_STATE" }
  | { type: "VIEW_POLL_HISTORY" }
  | { type: "CLOSE" }
  | { type: "CLOSE_QUEUE" }
  | { type: "CREATE_ROOM" }
  | { type: "BACK" }
  | { type: "EDIT_CONTENT" }
  | { type: "EDIT_CHAT" }
  | { type: "EDIT_DJ" }
  | { type: "EDIT_SPOTIFY" }
  | { type: "EDIT_PASSWORD" }
  | { type: "EDIT_SCHEDULE" }
  | { type: "EDIT_GAME_SESSIONS" }
  | { type: "EDIT_POLLS" }
  | { type: "EDIT_PLAYLIST_DEMOCRACY" }
  | { type: "EDIT_SPECIAL_WORDS" }
  | { type: "EDIT_ABSENT_DJ" }
  | { type: "EDIT_QUEUE_HYGIENE" }
  | { type: "EDIT_GUESS_THE_TUNE" }
  | { type: "EDIT_MUSIC_SHOP" }
  | { type: "EDIT_LOYALTY_PROGRAM" }
  | { type: "EDIT_ITEM_SHOPS" }
  | { type: "EDIT_QUEUE_PACER" }
  | { type: "EDIT_QUIZ_SESSIONS" }
  | { type: "EDIT_VOLUME_MANAGER" }
  | { type: "EDIT_ROUND_ROBIN_DJ" }
  | { type: "EDIT_PLAYLIST_BINGO" }
  | { type: "EDIT_MUSIC_UPLOAD" }
  | { type: "NEXT" }
  | { type: "NUKE_USER" }

/** Jump to a settings section from any modal-region state (admin only). */
const openSettingsSection = (target: string) => ({
  target: `.settings.${target}`,
  guard: "isAdmin" as const,
})

const settingsSectionOn = {
  EDIT_CONTENT: ".content",
  EDIT_CHAT: ".chat",
  EDIT_DJ: ".dj",
  EDIT_SPOTIFY: ".spotify",
  EDIT_PASSWORD: ".password",
  EDIT_SCHEDULE: ".schedule",
  EDIT_GAME_SESSIONS: ".game_sessions",
  EDIT_POLLS: ".polls",
  EDIT_PLAYLIST_DEMOCRACY: ".playlist_democracy",
  EDIT_SPECIAL_WORDS: ".special_words",
  EDIT_ABSENT_DJ: ".absent_dj",
  EDIT_QUEUE_HYGIENE: ".queue_hygiene",
  EDIT_GUESS_THE_TUNE: ".guess_the_tune",
  EDIT_MUSIC_SHOP: ".music_shop",
  EDIT_LOYALTY_PROGRAM: ".loyalty_program",
  EDIT_ITEM_SHOPS: ".item_shops",
  EDIT_QUEUE_PACER: ".queue_pacer",
  EDIT_QUIZ_SESSIONS: ".quiz_sessions",
  EDIT_VOLUME_MANAGER: ".volume_manager",
  EDIT_ROUND_ROBIN_DJ: ".round_robin_dj",
  EDIT_PLAYLIST_BINGO: ".playlist_bingo",
  EDIT_MUSIC_UPLOAD: ".music_upload",
} as const

export const modalsMachine = setup({
  types: {
    context: {} as Context,
    events: {} as Event,
  },
  guards: {
    isAdmin: () => {
      return getIsAdmin()
    },
    canAddToQueue: () => {
      const isAdmin = getIsAdmin()
      const isDjOrDeputy = canDjAddToQueue()
      return isAdmin || isDjOrDeputy
    },
  },
  actions: {
    fetchSettings: () => {
      emitToSocket("GET_ROOM_SETTINGS", {})
    },
    setQueueBrowseMediaKey: assign(({ event }) => ({
      queueBrowseMediaKey: event.type === "EDIT_QUEUE" ? event.browseMediaKey ?? null : null,
    })),
    clearQueueBrowseMediaKey: assign({ queueBrowseMediaKey: null }),
  },
}).createMachine({
  id: "modals",
  type: "parallel",
  context: { queueBrowseMediaKey: null },
  states: {
    modal: {
      initial: "closed",
      on: {
        EDIT_USERNAME: ".username",
        EDIT_SETTINGS: {
          target: ".settings",
          guard: "isAdmin",
        },
        EDIT_CONTENT: openSettingsSection("content"),
        EDIT_CHAT: openSettingsSection("chat"),
        EDIT_DJ: openSettingsSection("dj"),
        EDIT_SPOTIFY: openSettingsSection("spotify"),
        EDIT_PASSWORD: openSettingsSection("password"),
        EDIT_SCHEDULE: openSettingsSection("schedule"),
        EDIT_GAME_SESSIONS: openSettingsSection("game_sessions"),
        EDIT_POLLS: openSettingsSection("polls"),
        EDIT_PLAYLIST_DEMOCRACY: openSettingsSection("playlist_democracy"),
        EDIT_SPECIAL_WORDS: openSettingsSection("special_words"),
        EDIT_ABSENT_DJ: openSettingsSection("absent_dj"),
        EDIT_QUEUE_HYGIENE: openSettingsSection("queue_hygiene"),
        EDIT_GUESS_THE_TUNE: openSettingsSection("guess_the_tune"),
        EDIT_MUSIC_SHOP: openSettingsSection("music_shop"),
        EDIT_LOYALTY_PROGRAM: openSettingsSection("loyalty_program"),
        EDIT_ITEM_SHOPS: openSettingsSection("item_shops"),
        EDIT_QUEUE_PACER: openSettingsSection("queue_pacer"),
        EDIT_QUIZ_SESSIONS: openSettingsSection("quiz_sessions"),
        EDIT_VOLUME_MANAGER: openSettingsSection("volume_manager"),
        EDIT_ROUND_ROBIN_DJ: openSettingsSection("round_robin_dj"),
        EDIT_PLAYLIST_BINGO: openSettingsSection("playlist_bingo"),
        EDIT_MUSIC_UPLOAD: openSettingsSection("music_upload"),
        VIEW_HELP: ".help",
        VIEW_BOOKMARKS: {
          target: ".bookmarks",
          guard: "isAdmin",
        },
        VIEW_LISTENERS: ".listeners",
        VIEW_SCHEDULE: ".schedule",
        VIEW_GAME_STATE: ".gameState",
        VIEW_POLL_HISTORY: ".pollHistory",
        CLOSE: ".closed",
        CREATE_ROOM: ".createRoom",
        NUKE_USER: ".nukeUser",
      },
      states: {
        closed: {},
        username: {},
        listeners: {},
        help: {},
        schedule: {},
        gameState: {},
        pollHistory: {},
        createRoom: {},
        settings: {
          entry: ["fetchSettings"],
          initial: "overview",
          on: settingsSectionOn,
          states: {
            overview: {},
            playlist_democracy: { on: { BACK: "overview" } },
            special_words: { on: { BACK: "overview" } },
            absent_dj: { on: { BACK: "overview" } },
            queue_hygiene: { on: { BACK: "overview" } },
            guess_the_tune: { on: { BACK: "overview" } },
            music_shop: { on: { BACK: "overview" } },
            loyalty_program: { on: { BACK: "overview" } },
            item_shops: { on: { BACK: "overview" } },
            queue_pacer: { on: { BACK: "overview" } },
            content: { on: { BACK: "overview" } },
            chat: { on: { BACK: "overview" } },
            dj: { on: { BACK: "overview" } },
            spotify: { on: { BACK: "overview" } },
            password: { on: { BACK: "overview" } },
            schedule: { on: { BACK: "overview" } },
            game_sessions: { on: { BACK: "overview" } },
            polls: { on: { BACK: "overview" } },
            reaction_triggers: { on: { BACK: "overview" } },
            message_triggers: { on: { BACK: "overview" } },
            quiz_sessions: { on: { BACK: "overview" } },
            volume_manager: { on: { BACK: "overview" } },
            round_robin_dj: { on: { BACK: "overview" } },
            playlist_bingo: { on: { BACK: "overview" } },
            music_upload: { on: { BACK: "overview" } },
          },
        },
        bookmarks: {},
        nukeUser: {},
      },
    },
    queue: {
      initial: "closed",
      on: {
        EDIT_QUEUE: {
          target: ".open",
          reenter: false,
          guard: "canAddToQueue",
          actions: "setQueueBrowseMediaKey",
        },
        CLOSE_QUEUE: {
          target: ".closed",
          actions: "clearQueueBrowseMediaKey",
        },
      },
      states: {
        closed: {},
        open: {},
      },
    },
  },
})
