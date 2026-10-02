/**
 * Declared plugin capabilities (ADR 0201). A plugin declares what other
 * plugins may ask of it; the registry routes `api.requestCapability` calls to
 * whichever registered plugin declares the capability. There is no direct
 * plugin-instance lookup.
 */

/** Open a room-wide shop round for a scope (e.g. a road-trip site stop). */
export type OpenRoomShopRequest = {
  /** Owner-chosen id; `closeRoomShop` only ends the round this scope opened. */
  scopeId: string
  title?: string
  /** Item Shops catalog shop ids the round is limited to. */
  shopIds: string[]
  /** Optional room message when the shop opens. */
  openingMessage?: string
}

export type OpenRoomShopResult =
  | { ok: true }
  | { ok: false; reason: "disabled" | "unknown-shop" | "unavailable" | "no-session" }

/** `warnings`: known shops this room can't open right now (e.g. Record Store off the Media Bridge). */
export type ValidateShopResult = { ok: true; warnings?: string[] } | { ok: false; errors: string[] }

/** Item Shops' room-shop access for other plugins (D13). Distinct from Item Shops' internal per-user `ItemShopsShopAccess`. */
export interface ShopAccessCapability {
  openRoomShop(req: OpenRoomShopRequest): Promise<OpenRoomShopResult>
  closeRoomShop(scopeId: string): Promise<void>
  validateShop(req: { shopIds: string[] }): Promise<ValidateShopResult>
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
