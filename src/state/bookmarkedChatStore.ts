import { create } from "zustand"
import xstate from "zustand-middleware-xstate"
import { createToggleableCollectionMachine } from "../machines/toggleableCollectionMachine"

const machine = createToggleableCollectionMachine({
  name: "bookmarks",
  idPath: "id",
  persistent: true,
  collection: [],
})

export const useBookmarkedChatStore = create(xstate(machine))

export const useBookmarks = () =>
  useBookmarkedChatStore((s) => s.state.context.collection)
