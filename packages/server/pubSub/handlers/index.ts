import { Server } from "socket.io"
import jukeboxHandlers from "./jukebox"
import errorHandlers from "./errors"
import roomHandlers from "./rooms"
import serviceAuthHandlers from "./serviceAuth"
import { AppContext } from "@repo/types"

export function bindPubSubHandlers(io: Server, context: AppContext) {
  jukeboxHandlers(io, context)
  errorHandlers(io, context)
  roomHandlers(io, context)
  serviceAuthHandlers(io, context)
}
