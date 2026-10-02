import { useCallback, useMemo, useSyncExternalStore } from "react"
import {
  ensurePluginComponentActor,
  getPluginComponentActor,
  type PluginComponentActor,
} from "../actors/pluginComponentRegistry"

type PluginStore = Record<string, unknown>

const EMPTY_STORE: PluginStore = {}
const EMPTY_STORES: Record<string, PluginStore> = {}
const noopSubscribe = () => () => {}

/**
 * A primitive derived from several plugins' live stores (ADR 0093). Because
 * the snapshot is a primitive, components re-render only when the derived
 * value changes, not on every store update.
 *
 * @param select - Derive the value; keep it stable (useCallback) with its own deps.
 */
export function usePluginStoresSelector<T extends string | number | boolean | null>(
  specs: readonly { pluginName: string; storeKeys: string[] }[],
  select: (stores: Record<string, PluginStore>) => T,
): T {
  const specKey = specs.map((s) => s.pluginName).join("|")
  const actors = useMemo<[string, PluginComponentActor][]>(
    () => specs.map((s) => [s.pluginName, ensurePluginComponentActor(s.pluginName, s.storeKeys)]),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- actors are keyed by plugin name
    [specKey],
  )

  const subscribe = useCallback(
    (onChange: () => void) => {
      const subs = actors.map(([, actor]) => actor.subscribe(onChange))
      return () => subs.forEach((sub) => sub.unsubscribe())
    },
    [actors],
  )

  const getSnapshot = useCallback(
    () =>
      select(
        actors.length === 0
          ? EMPTY_STORES
          : Object.fromEntries(
              actors.map(([name, actor]) => [name, actor.getSnapshot().context.store]),
            ),
      ),
    [actors, select],
  )

  return useSyncExternalStore(subscribe, getSnapshot)
}

/** Live store for one plugin, or an empty object when it has no component actor. */
export function usePluginStore(pluginName: string): PluginStore {
  const actor = getPluginComponentActor(pluginName)
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!actor) return noopSubscribe()
      const sub = actor.subscribe(onChange)
      return () => sub.unsubscribe()
    },
    [actor],
  )
  const getSnapshot = useCallback(() => actor?.getSnapshot().context.store ?? EMPTY_STORE, [actor])
  return useSyncExternalStore(subscribe, getSnapshot)
}
