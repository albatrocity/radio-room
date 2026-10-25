import type { Transition, TransitionContext, TripEffect } from "../helpers"
import type { TripLogEvent, TripState } from "../state"
import type { TripFlowEvent, TripFlowEventType } from "./events"
import { send, type MachineDef, type MachineEvent } from "./machine"
import { refresh } from "./view"

/**
 * The trip flow's router (ADR 0222). `dispatch` is the only way a site,
 * junction, layer, vote, or the trip itself changes phase. It routes each
 * event to the entity that handles it and runs the entity's three steps:
 * `interpret` (the only place with conditions) → `send` (the table) →
 * `onEnter` (the only place with effects). No game rules live here.
 */

export type FlowAcc = { next: TripState; log: TripLogEvent[]; effects: TripEffect[] }

/** Run more flow events now, depth-first, sharing this dispatch's event budget. */
export type Emit = (acc: FlowAcc, ...events: TripFlowEvent[]) => FlowAcc

export type EnterArgs<S extends string, E extends TripFlowEvent = TripFlowEvent> = {
  id: string
  /** The context, re-laid for the state after the move. */
  ctx: TransitionContext
  /** The context before the move (e.g. a fork's odometer, before it leaves the path). */
  prior: TransitionContext
  event: E
  from: S
  emit: Emit
}

/**
 * What an event means for one entity: a machine move, other flow events to
 * run instead, a data-only update (no phase change), or nothing.
 */
export type Interpretation<M extends MachineEvent> =
  | M
  | { then: TripFlowEvent[] }
  | { update: (acc: FlowAcc, emit: Emit) => FlowAcc }
  | null

export type FlowEntity<S extends string, M extends MachineEvent> = {
  machine: MachineDef<S, M>
  /** The flow events this entity handles. */
  handles: readonly TripFlowEventType[]
  /** The entity id an event addresses, or null when it addresses none. */
  target(event: TripFlowEvent): string | null
  /** Current phase; undefined when the entity doesn't exist (the event is ignored). */
  read(state: TripState, id: string, ctx: TransitionContext): S | undefined
  write(state: TripState, id: string, phase: S): TripState
  /** Domain event → machine event. The only conditional step. */
  interpret(
    event: TripFlowEvent,
    id: string,
    state: TripState,
    ctx: TransitionContext,
  ): Interpretation<M>
  /** Effects and follow-ups when `id` enters a state (self-transitions included). */
  onEnter?: Partial<Record<S, (acc: FlowAcc, args: EnterArgs<S>) => FlowAcc>>
}

/** Flow events that aren't machine moves: a sequencer step or an expansion. */
export type FlowHandler = (
  acc: FlowAcc,
  event: TripFlowEvent,
  ctx: TransitionContext,
  emit: Emit,
) => FlowAcc

/** Thrown when one dispatch runs more events than this: an outcome cycle. The CAS write aborts. */
export const MAX_FLOW_EVENTS = 64

export class FlowOverflowError extends Error {}

type AnyEntity = FlowEntity<string, MachineEvent>

type Registry = {
  entities: Partial<Record<TripFlowEventType, AnyEntity>>
  handlers: Partial<Record<TripFlowEventType, FlowHandler>>
}

let registry: Registry | null = null
let registryFactory: (() => Registry) | null = null

/** Called once by `flow/index.ts` with every entity and handler; resolved lazily (import cycles). */
export function registerFlow(
  factory: () => {
    // Each entity has its own phase and event types; the registry erases them.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    entities: readonly FlowEntity<any, any>[]
    handlers: Partial<Record<TripFlowEventType, FlowHandler>>
  },
): void {
  registryFactory = () => {
    const built = factory()
    const entities: Registry["entities"] = {}
    for (const entity of built.entities as unknown as AnyEntity[]) {
      for (const type of entity.handles) {
        if (entities[type] || built.handlers[type]) {
          throw new Error(`Flow event ${type} is handled twice`)
        }
        entities[type] = entity
      }
    }
    return { entities, handlers: built.handlers }
  }
  registry = null
}

function routes(): Registry {
  if (!registry) {
    if (!registryFactory) throw new Error("The trip flow isn't registered (import trip/flow)")
    registry = registryFactory()
  }
  return registry
}

/** Who handles each flow event: an entity's machine id, or `handler`. For the generated docs. */
export function describeRoutes(): Partial<Record<TripFlowEventType, string>> {
  const { entities, handlers } = routes()
  const out: Partial<Record<TripFlowEventType, string>> = {}
  for (const [type, entity] of Object.entries(entities)) {
    out[type as TripFlowEventType] = `${entity!.machine.id} machine`
  }
  for (const type of Object.keys(handlers)) out[type as TripFlowEventType] = "handler"
  return out
}

function run(
  acc: FlowAcc,
  ctx: TransitionContext,
  events: readonly TripFlowEvent[],
  budget: { left: number },
): FlowAcc {
  const emit: Emit = (inner, ...more) => run(inner, ctx, more, budget)
  for (const event of events) {
    if (--budget.left < 0) {
      throw new FlowOverflowError(`Trip flow ran over ${MAX_FLOW_EVENTS} events at ${event.type}`)
    }
    const { entities, handlers } = routes()
    const live = refresh(ctx, acc.next)
    const handler = handlers[event.type]
    if (handler) {
      acc = handler(acc, event, live, emit)
      continue
    }
    const entity = entities[event.type]
    if (!entity) continue
    const id = entity.target(event)
    if (id === null) continue
    const from = entity.read(acc.next, id, live)
    if (from === undefined) continue
    const meaning = entity.interpret(event, id, acc.next, live)
    if (!meaning) continue
    if ("then" in meaning) {
      acc = emit(acc, ...meaning.then)
      continue
    }
    if ("update" in meaning) {
      acc = meaning.update(acc, emit)
      continue
    }
    const to = send(entity.machine, from, meaning)
    if (to === null) continue
    acc = { ...acc, next: entity.write(acc.next, id, to) }
    const enter = entity.onEnter?.[to]
    if (enter) acc = enter(acc, { id, ctx: refresh(ctx, acc.next), prior: live, event, from, emit })
  }
  return acc
}

/** Run `events` (and every follow-up they cause, depth-first) on `acc`. */
export function flow(acc: FlowAcc, ctx: TransitionContext, ...events: TripFlowEvent[]): FlowAcc {
  return run(acc, ctx, events, { left: MAX_FLOW_EVENTS })
}

/** A Transition that runs `events`; null when nothing changed. */
export function dispatch(...events: TripFlowEvent[]): Transition {
  return (state, ctx) => {
    const acc = flow({ next: state, log: [], effects: [] }, ctx, ...events)
    if (acc.next === state && acc.log.length === 0 && acc.effects.length === 0) return null
    return { next: acc.next, log: acc.log, effects: acc.effects }
  }
}

/** Merge a plain transition result into an accumulator. */
export function absorb(
  acc: FlowAcc,
  result: { next: TripState; log?: TripLogEvent[]; effects?: TripEffect[] },
): FlowAcc {
  return {
    next: result.next,
    log: [...acc.log, ...(result.log ?? [])],
    effects: [...acc.effects, ...(result.effects ?? [])],
  }
}
