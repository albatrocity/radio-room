/**
 * Declared plugin capabilities (ADR 0206). A plugin declares what other
 * plugins may ask of it; the registry routes `api.requestCapability` calls to
 * whichever registered plugin declares the capability. There is no direct
 * plugin-instance lookup.
 */

import type { PhysicalMediaCarry, PhysicalMediaFormat } from "./Inventory"

/**
 * One custom offer in a room shop: any registered item by full definition id
 * (e.g. `road-trip:fix-a-flat`), added to every user's instance (D14).
 */
export type RoomShopOffer = {
  definitionId: string
  /** Unscaled price; defaults to the definition's `coinValue`. Scaled by `costScale`. */
  basePrice?: number
  /** Units each user can buy this round (default 1). */
  stock?: number
}

/** Per-traveler sample drawn from a composed offer pool. */
export type RoomShopSample = {
  /** How many offers each traveler sees (1–8). */
  count: number
  /** `rarity` uses the catalog rarity weights. `even` gives every offer the same weight. */
  weights?: "rarity" | "even"
}

/**
 * Open a room-wide shop round for a scope (e.g. a road-trip site stop). The
 * round's shop is composed: custom offers plus an optional record bin
 * (ADR 0214). At least one of `offers` / `physicalMedia` is required.
 */
export type OpenRoomShopRequest = {
  /** Owner-chosen id; `closeRoomShop` only ends the round this scope opened. */
  scopeId: string
  title?: string
  /** Custom offers on the round's shop. */
  offers?: RoomShopOffer[]
  /**
   * Derived records the shop stocks. Each traveler sees 3 distinct picks,
   * re-matched for late joiners. `{}` = every record.
   */
  physicalMedia?: PhysicalMediaCarry
  /** Buyback fraction (0–1) for listed offers and anything else. Default 0. */
  buybackRate?: number
  /**
   * When set, `offers` is a pool and each traveler sees `count` weighted picks.
   * Omitted offers stay on the shelf for everyone. The record bin samples on its own.
   */
  sample?: RoomShopSample
  /** Optional room message when the shop opens. */
  openingMessage?: string
}

export type OpenRoomShopResult =
  | { ok: true }
  | {
      ok: false
      reason: "disabled" | "unknown-item" | "unavailable" | "no-session"
    }

/** `warnings`: what this room can't sell right now (e.g. records off the Media Bridge). */
export type ValidateShopResult = { ok: true; warnings?: string[] } | { ok: false; errors: string[] }

export type ValidateShopRequest = { offers?: RoomShopOffer[]; physicalMedia?: PhysicalMediaCarry }

/**
 * Formats everyone in the room can play without holding a device, e.g. the
 * van on a trip (ADR 0215). `gentle` skips wear for those formats (ADR 0166).
 */
export type SharedPlayback = { formats: PhysicalMediaFormat[]; gentle?: boolean }

/** Item Shops' room-shop access for other plugins (D13). Distinct from Item Shops' internal per-user `ItemShopsShopAccess`. */
export interface ShopAccessCapability {
  openRoomShop(req: OpenRoomShopRequest): Promise<OpenRoomShopResult>
  closeRoomShop(scopeId: string): Promise<void>
  validateShop(req: ValidateShopRequest): Promise<ValidateShopResult>
  /**
   * Set (or, with empty `formats`, clear) one owner's shared playback. Owners'
   * formats union; the caller still has to own the record.
   */
  setSharedPlayback(ownerId: string, playback: SharedPlayback): Promise<void>
}

/** Every capability a plugin can declare. Add new capabilities here. */
export type PluginCapabilities = {
  shopAccess?: ShopAccessCapability
}

export type PluginCapabilityName = keyof PluginCapabilities

type CapabilityMethods<C extends PluginCapabilityName> = NonNullable<PluginCapabilities[C]>

export type CapabilityMethodName<C extends PluginCapabilityName> = {
  [M in keyof CapabilityMethods<C>]: CapabilityMethods<C>[M] extends (...args: any[]) => any
    ? M
    : never
}[keyof CapabilityMethods<C>]

export type CapabilityMethodArgs<
  C extends PluginCapabilityName,
  M extends CapabilityMethodName<C>,
> = CapabilityMethods<C>[M] extends (...args: infer A) => any ? A : never

export type CapabilityMethodReturn<
  C extends PluginCapabilityName,
  M extends CapabilityMethodName<C>,
> = CapabilityMethods<C>[M] extends (...args: any[]) => infer R ? Awaited<R> : never

/** `unsupported`: no registered plugin declares the capability. `error`: the provider threw. */
export type CapabilityRequestResult<T> =
  | { ok: true; value: T; provider: string }
  | { ok: false; reason: "unsupported" | "error"; message?: string }
