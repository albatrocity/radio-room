import { AppContext } from "@repo/types"
import * as roomsOperations from "./data/rooms"
import * as usersOperations from "./data/users"
import * as djsOperations from "./data/djs"
import * as messagesOperations from "./data/messages"
import * as userChallengeOperations from "./userChallenge"

// This function creates a proxy to operations with the context automatically injected
export function createOperations(context: AppContext) {
  return {
    rooms: createContextInjector(roomsOperations, context),
    users: createContextInjector(usersOperations, context),
    djs: createContextInjector(djsOperations, context),
    messages: createContextInjector(messagesOperations, context),
    userChallenge: createContextInjector(userChallengeOperations, context),
  }
}

// Helper function to inject context into every operation function
function createContextInjector<T extends Record<string, any>>(
  operations: T,
  context: AppContext,
): T {
  const result: Record<string, any> = {}

  for (const key in operations) {
    const value = operations[key]
    if (typeof value === "function") {
      // check if the last parameter is expected to be context
      // If it is, we call the function with the context as the last argument
      // If not, we don't add the context parameter
      result[key] = (...args: any[]) => {
        // Check if the function accepts context as its last parameter
        const functionStr = value.toString()
        const takesContext =
          functionStr.includes("context: AppContext") || functionStr.includes("context:AppContext")

        if (takesContext) {
          return value(...args, context)
        } else {
          return value(...args)
        }
      }
    } else {
      result[key] = value
    }
  }

  return result as T
}

// Example usage:
// const operations = createOperations(context);
// await operations.rooms.saveRoom(room); // No need to pass context
// await operations.users.getUserById(userId); // No need to pass context

// For socket handlers, you can extract the context from the socket:
// socket.on('some-event', async (data) => {
//   const operations = createOperations(socket.context);
//   await operations.rooms.saveRoom(data.room);
// });
