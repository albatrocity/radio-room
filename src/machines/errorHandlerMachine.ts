// machine that catches error events and throws toasts
import { assign, raise, createMachine } from "xstate"

import { toast } from "../lib/toasts"
import socketService from "../lib/socketService"

type ErrorEvent = {
  type: string
  data?: {
    status: number
    error: string
    message: string
  }
}

interface Context {
  errors: ErrorEvent["data"][]
}

export const errorHandlerMachine = createMachine<Context, ErrorEvent>(
  {
    id: "errorHandler",
    predictableActionArguments: true,
    context: {
      errors: [],
    },
    invoke: [
      {
        id: "socket",
        src: () => socketService,
      },
    ],
    on: {
      ERROR: {
        actions: ["notify", "addError"],
      },
      CLEAR_ERROR: {
        actions: ["removeError"],
      },
    },
  },
  {
    actions: {
      notify: (_ctx, event) => {
        toast({
          title: event.data?.error,
          description: event.data?.message,
          status: "error",
          duration: 3000,
          isClosable: true,
          onCloseComplete: () => {
            raise({ type: "CLEAR_ERROR" })
          },
        })
      },
      addError: assign((ctx, event) => ({
        errors: [...ctx.errors, event.data],
      })),
      removeError: assign((ctx, event) => ({
        errors: ctx.errors.filter((e) => e !== event.data),
      })),
    },
  },
)
