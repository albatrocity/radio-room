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
    duration?: number
    id?: string
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
      notify: (ctx, event) => {
        if (
          ctx.errors.filter((x) => !!x).find((e) => e?.id === event.data?.id)
        ) {
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
