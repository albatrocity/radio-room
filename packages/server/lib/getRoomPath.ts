export default function getRoomPath(roomId?: string) {
  return roomId ? `/rooms/${roomId}` : "/";
}
