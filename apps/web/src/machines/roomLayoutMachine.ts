import { assign, setup } from "xstate"

import {
  type RoomLayoutKey,
  type RoomLayoutState,
  getDefaultLayout,
  loadRoomLayout,
  normalizeLayoutSizes,
  saveRoomLayout,
} from "../lib/roomLayoutStorage"

export type RoomLayoutEvent =
  | { type: "RESIZE_END"; layout: RoomLayoutKey; sizes: number[] }
  | { type: "RESET"; layout?: RoomLayoutKey }

export const roomLayoutMachine = setup({
  types: {
    context: {} as RoomLayoutState,
    events: {} as RoomLayoutEvent,
  },
  actions: {
    loadLayout: assign(() => loadRoomLayout()),
    persistLayout: ({ context }) => {
      saveRoomLayout(context)
    },
  },
}).createMachine({
  id: "roomLayout",
  initial: "active",
  context: loadRoomLayout(),
  states: {
    active: {
      entry: ["loadLayout"],
      on: {
        RESIZE_END: {
          actions: [
            assign(({ context, event }) => {
              if (event.type !== "RESIZE_END") return {}
              const sizes = normalizeLayoutSizes(event.sizes)
              if (event.layout === "4") {
                return { ...context, layout4: sizes }
              }
              return { ...context, layout3: sizes }
            }),
            "persistLayout",
          ],
        },
        RESET: {
          actions: [
            assign(({ context, event }) => {
              if (event.type !== "RESET") return {}
              if (event.layout === "4") {
                return { ...context, layout4: getDefaultLayout("4") }
              }
              if (event.layout === "3") {
                return { ...context, layout3: getDefaultLayout("3") }
              }
              return {
                layout3: getDefaultLayout("3"),
                layout4: getDefaultLayout("4"),
              }
            }),
            "persistLayout",
          ],
        },
      },
    },
  },
})
