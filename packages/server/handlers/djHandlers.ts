import sendMessage from "../lib/sendMessage"
import systemMessage from "../lib/systemMessage"

import { HandlerConnections } from "@repo/types/HandlerConnections"
import { User } from "@repo/types/User"

import {
  addDj,
  addToQueue,
  findRoom,
  getDjs,
  getQueue,
  getUser,
  isDj,
  removeDj,
  updateUserAttributes,
} from "../operations/data"
import { pubUserJoined } from "../operations/sockets/users"
import { QueueItem } from "@repo/types/Queue"
import { MetadataSource, MetadataSourceTrack } from "@repo/types"

export async function djDeputizeUser({ io, socket }: HandlerConnections, userId: User["userId"]) {
  const { context } = socket
  const storedUser = await getUser({ context, userId })
  const socketId = storedUser?.id

  let eventType, message, isDeputyDj

  const userIsDj = await isDj({ context, roomId: socket.data.roomId, userId })

  if (userIsDj) {
    eventType = "END_DEPUTY_DJ_SESSION"
    message = "You are no longer a deputy DJ"
    isDeputyDj = false
    await removeDj({ context, roomId: socket.data.roomId, userId })
  } else {
    eventType = "START_DEPUTY_DJ_SESSION"
    message = "You've been promoted to a deputy DJ. You may now add songs to the DJ's queue."
    isDeputyDj = true
    await addDj({ context, roomId: socket.data.roomId, userId })
  }

  const { user, users } = await updateUserAttributes({
    context,
    userId,
    attributes: { isDeputyDj },
    roomId: socket.data.roomId,
  })

  if (socketId) {
    io.to(socketId).emit(
      "event",
      {
        type: "NEW_MESSAGE",
        data: systemMessage(message, { type: "alert", status: "info" }),
      },
      { status: "info" },
    )

    io.to(socketId).emit("event", { type: eventType })
  }

  if (user) {
    pubUserJoined({ io, roomId: socket.data.roomId, data: { user, users }, context })
  }
}

export async function queueSong({ socket, io }: HandlerConnections, id: QueueItem["track"]["id"]) {
  try {
    const { context } = socket
    const currentUser = await getUser(socket.data.userId)

    // TODO: Sync queue with MediaSource
    // await syncQueue(socket.data.roomId);

    const queue = await getQueue(socket.data.roomId)

    const inQueue = queue.find((x) => x.track.id === id)

    if (inQueue) {
      const djUsername =
        (await getUser({ context, userId: inQueue.addedBy?.userId! }))?.username ?? "Someone"

      socket.emit("event", {
        type: "SONG_QUEUE_FAILURE",
        data: {
          message:
            inQueue.addedBy?.userId === socket.data.userId
              ? "You've already queued that song, please choose another"
              : `${djUsername} has already queued that song. Please try a different song.`,
        },
      })
      return
    }

    // const spotifyApi = await getSpotifyApiForRoom(socket.data.roomId);
    // const data = await spotifyApi.addToQueue(uri);

    // TODO: Add via MediaSource, fetch via MetadataSource
    const track = {} as MetadataSourceTrack

    const queuedItem: QueueItem = {
      track,
      addedBy: {
        userId: socket.data.userId,
        username: currentUser?.username,
      },
      addedAt: Date.now(),
      addedDuring: undefined,
      playedAt: undefined,
    }

    await addToQueue({ context, roomId: socket.data.roomId, item: queuedItem })

    socket.emit("event", {
      type: "SONG_QUEUED",
      data: queuedItem,
    })
    const queueMessage = systemMessage(
      `${currentUser ? currentUser.username : "Someone"} added a song to the queue`,
    )
    sendMessage(io, socket.data.roomId, queueMessage)
  } catch (e) {
    socket.emit("event", {
      type: "SONG_QUEUE_FAILURE",
      data: {
        message: "Song could not be queued",
        error: e,
      },
    })
  }
}

export async function searchForTrack(
  { socket }: HandlerConnections,
  metadataSource: MetadataSource,
  { query }: { query: string },
) {
  try {
    const data = await metadataSource.api.search(query)

    socket.emit("event", {
      type: "TRACK_SEARCH_RESULTS",
      data,
    })
  } catch (e) {
    socket.emit("event", {
      type: "TRACK_SEARCH_RESULTS_FAILURE",
      data: {
        message:
          "Something went wrong when trying to search for tracks. You might need to log in to Spotify's OAuth",
        error: e,
      },
    })
  }
}

export async function savePlaylist(
  { socket }: HandlerConnections,
  metadataSource: MetadataSource,
  { name, trackIds }: { name: string; trackIds: QueueItem["track"]["id"][] },
) {
  try {
    if (metadataSource.api.createPlaylist === undefined) {
      socket.emit("event", {
        type: "SAVE_PLAYLIST_FAILURE",
        data: {
          message: "Playlist creation is not supported by this source",
        },
      })
      return
    }

    const data = await metadataSource.api.createPlaylist({
      title: name,
      trackIds,
      userId: socket.data.userId,
    })

    socket.emit("event", { type: "PLAYLIST_SAVED", data })
  } catch (error) {
    socket.emit("event", { type: "SAVE_PLAYLIST_FAILED", error })
  }
}

export async function handleUserJoined(
  { io, socket }: HandlerConnections,
  { user }: { user: User; users: User[] },
) {
  const room = await findRoom(socket.data.roomId)
  const deputyDjs = await getDjs(socket.data.roomId)
  if (room?.deputizeOnJoin && !deputyDjs.includes(user.userId)) {
    djDeputizeUser({ io, socket }, user.userId)
  }
}
