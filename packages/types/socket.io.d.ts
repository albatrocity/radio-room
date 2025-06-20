import { Session } from "express-session"
import "socket.io"
import { IncomingMessage } from "http"
import { User } from "./User"

// Define the session structure
interface ExtendedSession extends Session {
  save: (callback?: (err?: any) => void) => void
  destroy: (callback?: (err?: any) => void) => void
  user?: User
  roomId?: string
}

// Extend the IncomingMessage in http module
declare module "http" {
  interface IncomingMessage {
    session: ExtendedSession
    res?: any
  }
}

// Extend the Socket in socket.io module
declare module "socket.io" {
  interface Socket {
    request: IncomingMessage & {
      session: ExtendedSession
    }
  }
}
