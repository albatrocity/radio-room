import { createMachine, assign } from "xstate"
import session from "sessionstorage"
import socketService from "../lib/socketService"
import { concat, uniqBy } from "lodash/fp"
import { ChatMessage } from "../types/ChatMessage"

export const toggleableCollectionMachine = createMachine(
  {
    predictableActionArguments: true,
    tsTypes: {} as import("./toggleableCollectionMachine.typegen").Typegen0,
    id: "toggleableCollection",
    initial: "ready",
    context: {
      collection: [],
      persistent: true,
      name: "bookmarks",
    },
    on: {
      TOGGLE_ITEM: { actions: ["toggleItem"] },
      CLEAR: { actions: ["clear"] },
    },
    invoke: [
      {
        id: "socket",
        src: (_ctx, _event) => socketService,
      },
    ],
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
  },
  {
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
          JSON.parse(sessionStorage.getItem(context.name) || "[]") || [],
      }),
      setName: assign({ name: (context, event) => event.data }),
      clear: assign({ collection: [] }),
      toggleItem: assign({
        collection: (context, event) => {
          const isPresent = context.collection
            .map(({ id }) => id)
            .includes(event.data.id)

          if (isPresent) {
            return context.collection.filter(
              (x: ChatMessage) => x.id !== event.data.id,
            )
          }
          return uniqBy("id", concat(event.data, context.collection))
        },
      }),
    },
  },
)
