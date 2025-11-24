import { HandlerConnections } from "@repo/types/HandlerConnections"
import { createMessageHandlers } from "./messageHandlersAdapter"

// Create message handlers for each socket connection using the context
export async function newMessage({ socket, io }: HandlerConnections, message: string) {
  const { context } = socket
  const messageHandlers = createMessageHandlers(context)
  return messageHandlers.newMessage({ socket, io }, message)
}

export async function clearMessages({ socket, io }: HandlerConnections) {
  const { context } = socket
  const messageHandlers = createMessageHandlers(context)
  return messageHandlers.clearMessages({ socket, io })
}

export async function startTyping({ socket, io }: HandlerConnections) {
  const { context } = socket
  const messageHandlers = createMessageHandlers(context)
  return messageHandlers.startTyping({ socket, io })
}

export async function stopTyping({ socket, io }: HandlerConnections) {
  const { context } = socket
  const messageHandlers = createMessageHandlers(context)
  return messageHandlers.stopTyping({ socket, io })
}
