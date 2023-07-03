import { createMachine } from "xstate"
import { Room } from "../../types/Room"

interface Context {
  type: Room["type"]
}

type Event = { type: "NEXT"; data: { type: string } } | { type: "BACK" }

export const createRoomFormMachine = createMachine<Context, Event>(
  {
    predictableActionArguments: true,
    id: "createRoomForm",
    initial: "selectType",
    context: {
      type: "jukebox",
    },
    on: {},
    states: {
      selectType: {
        on: {
          NEXT: "settings",
        },
      },
      settings: {
        on: {
          BACK: "selectType",
        },
      },
    },
  },
  {
    guards: {},
    actions: {},
  },
)
