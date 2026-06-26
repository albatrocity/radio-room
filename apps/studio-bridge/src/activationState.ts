/** Per-room segment activation overlay (studio preview; not persisted). */
export type RoomActivationState = {
  activeSegmentId: string
  activeShowSegmentId?: string
}

const byRoomId = new Map<string, RoomActivationState>()

export function getRoomActivation(roomId: string): RoomActivationState | undefined {
  return byRoomId.get(roomId)
}

export function setRoomActivation(
  roomId: string,
  state: RoomActivationState,
): RoomActivationState {
  byRoomId.set(roomId, state)
  return state
}
