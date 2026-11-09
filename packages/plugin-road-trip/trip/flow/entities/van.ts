import type { TripKeyItem } from "@repo/road-trip-map"
import type { TransitionContext } from "../../helpers"
import type { FlowEntity, FlowHandler } from "../dispatch"
import type { TripFlowEvent } from "../events"
import { keyMachine, type KeyMachineEvent, type KeyPhase } from "../machines"

/**
 * The van's key items (ADR 0230): one `keyMachine` per `map.keyItems` id, kept
 * as `state.keyItems` (present = held). A key does nothing by itself; `{ has }`
 * conditions read it. Giving a held key is not a move, so it posts nothing.
 * Only this entity writes `state.keyItems`.
 */

function keyOf(ctx: TransitionContext, id: string): TripKeyItem | undefined {
  return ctx.source.keyItems?.find((key) => key.id === id)
}

function keyIdOf(event: TripFlowEvent): string | null {
  return event.type === "KEY_GIVE" || event.type === "KEY_TAKE" ? event.key : null
}

export const vanEntity: FlowEntity<KeyPhase, KeyMachineEvent> = {
  machine: keyMachine,
  handles: ["KEY_GIVE", "KEY_TAKE"],
  target: keyIdOf,
  read: (state, id, ctx) => (state.keyItems[id] ? "held" : keyOf(ctx, id) ? "absent" : undefined),
  write: (state, id, phase) => {
    if (phase === "absent") {
      const { [id]: _taken, ...rest } = state.keyItems
      return { ...state, keyItems: rest }
    }
    // `onEnter.held` stamps who gave it and when, in the same dispatch.
    return {
      ...state,
      keyItems: { ...state.keyItems, [id]: state.keyItems[id] ?? { at: 0, by: { kind: "host" } } },
    }
  },
  interpret: (event, _id, state) => {
    if (state.status !== "loaded" && state.status !== "driving") return null
    if (event.type === "KEY_GIVE") return { type: "GIVE" }
    if (event.type === "KEY_TAKE") return { type: "TAKE" }
    return null
  },
  onEnter: {
    held: (acc, { id, ctx, event }) => {
      if (event.type !== "KEY_GIVE") return acc
      const key = keyOf(ctx, id)!
      const stamped = {
        ...acc.next,
        keyItems: { ...acc.next.keyItems, [id]: { at: ctx.now, by: event.by } },
      }
      // An outcome's own narrative replaces the key's found narrative.
      const body = (event.narrative ?? key.foundNarrative)?.trim()
      return {
        ...acc,
        next: stamped,
        effects: body ? [...acc.effects, { type: "narrate", body }] : acc.effects,
      }
    },
  },
}

/** ITEMS_GIVE: the plugin hands the item out after the CAS (`give-items`), picking from who's online. */
export const itemsGiveHandler: FlowHandler = (acc, event, ctx) => {
  if (event.type !== "ITEMS_GIVE") return acc
  if (acc.next.status !== "loaded" && acc.next.status !== "driving") return acc
  return {
    ...acc,
    effects: [
      ...acc.effects,
      {
        type: "give-items",
        item: event.item,
        to: event.to,
        qty: event.qty,
        pick: `${JSON.stringify(event.by)}:${event.item}:${ctx.now}:${acc.effects.length}`,
      },
    ],
  }
}
