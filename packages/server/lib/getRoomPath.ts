export function getRoomPath(roomId?: string) {
  return roomId ? `/rooms/${roomId}` : "/"
}
