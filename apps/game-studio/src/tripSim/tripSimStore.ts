import { useSyncExternalStore } from "react"
import { TripSimRoom } from "@repo/plugin-road-trip/sim"
import type { TripMapInput } from "@repo/road-trip-map"
import { STUDIO_ROOM_ID } from "../studio/constants"
import { postTripSim } from "./tripSimBridge"

/**
 * The loaded trip simulation, kept outside React so it survives switching
 * studio pages. Every change is published to studio-bridge.
 */
let room: TripSimRoom | null = null
let version = 0
const listeners = new Set<() => void>()

function bridgeUrl(): string {
  return import.meta.env.VITE_STUDIO_BRIDGE_URL ?? "http://127.0.0.1:3099"
}

function notify(): void {
  version++
  for (const listener of listeners) listener()
  void postTripSim(bridgeUrl(), STUDIO_ROOM_ID, room ? room.snapshot() : null)
}

export function loadTripSim(map: TripMapInput): void {
  room = new TripSimRoom(map, { roomId: STUDIO_ROOM_ID })
  notify()
}

export function clearTripSim(): void {
  room = null
  notify()
}

/** Run an action on the loaded sim, then publish. */
export function runTripSim<T>(action: (sim: TripSimRoom) => T): T | undefined {
  if (!room) return undefined
  const result = action(room)
  notify()
  return result
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The loaded sim and a version that changes on every action (for re-rendering). */
export function useTripSim(): { room: TripSimRoom | null; version: number } {
  const v = useSyncExternalStore(subscribe, () => version)
  return { room, version: v }
}
