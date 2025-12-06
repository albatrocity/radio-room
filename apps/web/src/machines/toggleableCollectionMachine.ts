import { setup, assign } from "xstate"
import { uniqBy, get } from "lodash/fp"
import { ChatMessage } from "../types/ChatMessage"

interface Context {
  collection: any[]
  persistent: boolean
  name: string
  idPath?: string
}

type ToggleableCollectionEvent =
  | { type: "TOGGLE_ITEM"; data: any }
  | { type: "TOGGLE_MESSAGE"; data: any }
  | { type: "SET_ITEMS"; data: any[] }
  | { type: "ADD_ITEMS"; data: any[] }
  | { type: "CLEAR" }
  | { type: "ENABLE_PERSISTENCE" }
  | { type: "SET_NAME"; data: string }

const createMachineConfig = (initialContext: Context) =>
  setup({
    types: {
      context: {} as Context,
      events: {} as ToggleableCollectionEvent,
    },
    actions: {
      enablePersistence: assign({
        persistent: () => true,
      }),
      persist: ({ context }) => {
        if (context.persistent) {
          sessionStorage.setItem(context.name, JSON.stringify(context.collection))
        }
      },
      loadCollection: assign({
        collection: ({ context }) =>
          context.persistent
            ? JSON.parse(sessionStorage.getItem(context.name) || "[]") || []
            : context.collection,
      }),
      setName: assign({
        name: ({ event }) => {
          if (event.type === "SET_NAME") {
            return event.data
          }
          return ""
        },
      }),
      setItems: assign({
        collection: ({ event }) => {
          if (event.type === "SET_ITEMS") {
            return event.data
          }
          return []
        },
      }),
      addItems: assign({
        collection: ({ context, event }) => {
          if (event.type !== "ADD_ITEMS") return context.collection
          return uniqBy(context.idPath || "id", [...event.data, ...context.collection])
        },
      }),
      clear: assign({ collection: [] }),
      toggleItem: assign({
        collection: ({ context, event }) => {
          if (event.type !== "TOGGLE_ITEM" && event.type !== "TOGGLE_MESSAGE") {
            return context.collection
          }
          const isPresent = context.collection
            .map((record) => get(context.idPath || "id", record))
            .includes(get(context.idPath || "id", event.data))

          if (isPresent) {
            return context.collection.filter(
              (x: ChatMessage) =>
                get(context.idPath || "id", x) !== get(context.idPath || "id", event.data),
            )
          }
          return uniqBy("id", [event.data, ...context.collection])
        },
      }),
    },
  }).createMachine({
    id: "toggleableCollection",
    initial: "ready",
    context: initialContext,
    on: {
      TOGGLE_ITEM: { actions: ["toggleItem", "persist"] },
      SET_ITEMS: { actions: ["setItems"] },
      ADD_ITEMS: { actions: ["addItems"] },
      CLEAR: { actions: ["clear"] },
    },
    states: {
      ready: {
        entry: ["loadCollection"],
        on: {
          TOGGLE_MESSAGE: { actions: ["toggleItem", "persist"] },
          ENABLE_PERSISTENCE: { actions: ["enablePersistence"] },
          SET_NAME: { actions: ["setName"] },
        },
      },
    },
  })

export const toggleableCollectionMachine = createMachineConfig({
  collection: [],
  persistent: true,
  name: "bookmarks",
  idPath: "id",
})

export function createToggleableCollectionMachine(context: Context) {
  return createMachineConfig(context)
}
