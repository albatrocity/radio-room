/**
 * A tiny flat state-machine engine (ADR 0222). Tables list legal moves only:
 * no guards, no actions, no timers, no nesting. Conditions live in an
 * entity's `interpret`, effects in its `onEnter`. Needing nesting or history
 * is the signal to adopt XState instead of growing this file.
 *
 * No imports: this file is meant to move to `@repo/utils` unchanged once a
 * second plugin needs it.
 */

export type MachineEvent = { type: string }

export type MachineDef<S extends string, E extends MachineEvent> = {
  id: string
  initial: S
  /** Legal moves only. A missing entry means the event is ignored in that state. */
  states: { [K in S]: { on?: { [T in E["type"]]?: S }; final?: true; description?: string } }
  /** One line per event type, for the generated docs. */
  events?: { [T in E["type"]]?: string }
}

export function defineMachine<S extends string, E extends MachineEvent>(
  def: MachineDef<S, E>,
): MachineDef<S, E> {
  if (!(def.initial in def.states)) {
    throw new Error(`Machine ${def.id}: initial state ${def.initial} is not a state`)
  }
  for (const [from, node] of Object.entries(def.states) as [S, { on?: Record<string, S> }][]) {
    for (const [type, to] of Object.entries(node.on ?? {})) {
      if (!(to in def.states)) {
        throw new Error(`Machine ${def.id}: ${from} --${type}--> ${to} targets an unknown state`)
      }
    }
  }
  return def
}

/** The next state, or null when the move isn't legal (the caller treats null as a no-op). */
export function send<S extends string, E extends MachineEvent>(
  def: MachineDef<S, E>,
  from: S,
  event: E,
): S | null {
  const node = def.states[from]
  if (!node) return null
  const to = (node.on as Record<string, S> | undefined)?.[event.type]
  return to ?? null
}

/** Every state reachable from `initial`. */
export function reachableStates<S extends string, E extends MachineEvent>(
  def: MachineDef<S, E>,
): Set<S> {
  const seen = new Set<S>([def.initial])
  const queue: S[] = [def.initial]
  while (queue.length > 0) {
    const from = queue.shift()!
    for (const to of Object.values(def.states[from].on ?? {}) as S[]) {
      if (!seen.has(to)) {
        seen.add(to)
        queue.push(to)
      }
    }
  }
  return seen
}

/** Every move as `[from, event, to]`, in table order. */
export function moves<S extends string, E extends MachineEvent>(
  def: MachineDef<S, E>,
): [S, E["type"], S][] {
  return (Object.entries(def.states) as [S, { on?: Record<string, S> }][]).flatMap(([from, node]) =>
    Object.entries(node.on ?? {}).map(([type, to]) => [from, type, to] as [S, E["type"], S]),
  )
}

/** A Mermaid `stateDiagram-v2` of the table. */
export function toMermaid<S extends string, E extends MachineEvent>(def: MachineDef<S, E>): string {
  const lines = ["stateDiagram-v2", `  [*] --> ${def.initial}`]
  for (const [from, type, to] of moves(def)) lines.push(`  ${from} --> ${to}: ${type}`)
  for (const [state, node] of Object.entries(def.states) as [S, { final?: true }][]) {
    if (node.final) lines.push(`  ${state} --> [*]`)
  }
  return lines.join("\n")
}
