import { useSyncExternalStore } from "react"
import { TripSimRoom, type SimShops } from "@repo/plugin-road-trip/sim"
import type { TripMapInput } from "@repo/road-trip-map"
import type { OpenRoomShopRequest, ShopAccessCapability } from "@repo/types"
import { STUDIO_ROOM_ID } from "../studio/constants"
import { getStudio } from "../studio/studioEnvironment"
import { startStudioGameSession } from "../studio/studioActions"
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

/** The sandbox's Item Shops `shopAccess`, so a stop opens a real shop round in the room. */
function sandboxShopAccess(): ShopAccessCapability | undefined {
  try {
    return getStudio().itemShopsPlugin.capabilities?.shopAccess
  } catch {
    return undefined
  }
}

/**
 * A stop's shop becomes a real sandbox round (Item Shops in Game Studio), so
 * the Room UI shows its shelf and record bin. Rounds need a game session; the
 * sandbox starts one when none is running.
 */
const sandboxShops: SimShops = {
  open(request: OpenRoomShopRequest) {
    void (async () => {
      const shopAccess = sandboxShopAccess()
      if (!shopAccess) return
      let result = await shopAccess.openRoomShop(request)
      if (!result.ok && result.reason === "no-session") {
        await startStudioGameSession()
        result = await shopAccess.openRoomShop(request)
      }
      if (!result.ok) {
        console.warn(`[trip-sim] ${request.title ?? request.scopeId}'s shop didn't open (${result.reason})`)
      }
    })()
  },
  close(scopeId: string) {
    void sandboxShopAccess()?.closeRoomShop(scopeId)
  },
}

export function loadTripSim(map: TripMapInput): void {
  room?.closeOpenShop()
  room = new TripSimRoom(map, { roomId: STUDIO_ROOM_ID, shops: sandboxShops })
  notify()
}

export function clearTripSim(): void {
  room?.closeOpenShop()
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
