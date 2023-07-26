import { Room, RoomMeta } from "../types/Room"

export default function makeRoomTitle(
  room: Omit<Room, "password"> | null,
  meta?: RoomMeta,
) {
  const track = meta?.track ?? meta?.title ?? ""
  const artist = meta?.artist ? ` - ${meta.artist} ` : ""
  const prefix = meta?.track ? `${track}${artist} |` : ""

  return `${prefix}${room?.title ? ` ${room.title}` : "Listening Room"}`
}
