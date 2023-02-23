import { assign, send, createMachine } from "xstate"
import socketService from "../lib/socketService"
import { SpotifyTrack } from "../types/SpotifyTrack"

interface Context {
  queuedTrack: SpotifyTrack | null | undefined
}

export const spotifyQueueMachine = createMachine<Context>(
  {
    predictableActionArguments: true,
    id: "spotify-queue",
    context: {
      queuedTrack: null,
    },
    on: {
      SEND_TO_QUEUE: {
        target: ".",
        actions: ["setQueuedTrack", "sendToQueue"],
      },
      SONG_QUEUED: { actions: ["onQueued"] },
    },
    invoke: [
      {
        id: "socket",
        src: () => socketService,
      },
    ],
  },
  {
    actions: {
      setQueuedTrack: assign((_context, event) => ({
        queuedTrack: event.track,
      })),
      sendToQueue: send(
        (_ctx, event) => {
          return {
            type: "queue song",
            data: event.track.uri,
          }
        },
        {
          to: "socket",
        },
      ),
    },
  },
)
