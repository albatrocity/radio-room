import { createMachine, assign, InternalMachineOptions } from "xstate"
import session from "sessionstorage"
import { concat, uniqBy, get } from "lodash/fp"
import { ChatMessage } from "../types/ChatMessage"

interface Context {
  collection: any[]
  persistent: boolean
  name: string
  idPath?: string
}

const config = {
  predictableActionArguments: true,
  id: "toggleableCollection",
  initial: "ready",
  context: {
    collection: [],
    persistent: true,
    name: "bookmarks",
    idPath: "id",
  },
  on: {
    TOGGLE_ITEM: { actions: ["toggleItem"] },
    SET_ITEMS: { actions: ["setItems"] },
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
}

const options: InternalMachineOptions<Context, any, any> = {
  actions: {
    enablePersistence: assign({
      persistent: () => true,
    }),
    persist: (context) => {
      if (context.persistent) {
        session.setItem(context.name, JSON.stringify(context.collection))
      }
    },
    loadCollection: assign({
      collection: (context) =>
        context.persistent
          ? JSON.parse(session.getItem(context.name) || "[]") || []
          : context.collection,
    }),
    setName: assign({ name: (_ctx, event) => event.data }),
    setItems: assign({ collection: (_ctx, event) => event.data }),
    clear: assign({ collection: [] }),
    toggleItem: assign({
      collection: (context, event) => {
        const isPresent = context.collection
          .map((record) => get(context.idPath || "id", record))
          .includes(get(context.idPath || "id", event.data))

        if (isPresent) {
          return context.collection.filter(
            (x: ChatMessage) =>
              get(context.idPath || "id", x) !==
              get(context.idPath || "id", event.data),
          )
        }
        return uniqBy("id", concat(event.data, context.collection))
      },
    }),
  },
}

export const toggleableCollectionMachine = createMachine<Context>(
  config,
  options,
)

export function createToggleableCollectionMachine(context: Context) {
  return createMachine<Context>({ ...config, context }, options)
}
