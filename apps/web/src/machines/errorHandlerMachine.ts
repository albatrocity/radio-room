// machine that catches error events and throws toasts
import { assign, setup } from "xstate"

import { toast } from "../lib/toasts"

type ErrorData = {
  status: number
  error: string
  message: string
  duration?: number
  id?: string
}

type ErrorEvent =
  | { type: "ERROR_OCCURRED"; data: ErrorData }
  | { type: "CLEAR_ERROR"; data: ErrorData }

interface Context {
  errors: ErrorData[]
}

export const errorHandlerMachine = setup({
  types: {
    context: {} as Context,
    events: {} as ErrorEvent,
  },
  actions: {
    notify: ({ context, event }) => {
      if (event.type !== "ERROR_OCCURRED") return
      if (context.errors.filter((x) => !!x).find((e) => e?.id === event.data?.id)) {
        return
      }
      toast({
        title: event.data?.error,
        description: event.data?.message,
        status: "error",
        duration: event.data?.duration === null ? null : 3000,
        isClosable: true,
        id: event.data?.id,
        onCloseComplete: () => {
          // Note: This will be handled via direct send to errorActor when needed
        },
      })
    },
    addError: assign(({ context, event }) => {
      if (event.type !== "ERROR_OCCURRED") return context
      return {
        errors: [...context.errors, event.data],
      }
    }),
    removeError: assign(({ context, event }) => {
      if (event.type !== "CLEAR_ERROR") return context
      return {
        errors: context.errors.filter((e) => e !== event.data),
      }
    }),
  },
}).createMachine({
  id: "errorHandler",
  context: {
    errors: [],
  },
  on: {
    ERROR_OCCURRED: {
      actions: ["notify", "addError"],
    },
    CLEAR_ERROR: {
      actions: ["removeError"],
    },
  },
})
