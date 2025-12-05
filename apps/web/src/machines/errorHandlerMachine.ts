// machine that catches error events and throws toasts
import { assign, createMachine } from "xstate"

import { toast } from "../lib/toasts"

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
    on: {
      ERROR_OCCURRED: {
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
            // Note: This will be handled via direct send to errorActor when needed
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
