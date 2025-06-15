import { Server } from "socket.io"
import jukeboxHandlers from "./jukebox"
import errorHandlers from "./errors"
import roomHandlers from "./rooms"
import { AppContext } from "../../lib/context"

export function bindPubSubHandlers(io: Server, context: AppContext) {
  jukeboxHandlers(io, context)
  errorHandlers(io, context)
  roomHandlers(io, context)
}
