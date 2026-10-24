import { INCIDENTS, vanConsumable, vanPart } from "@repo/road-trip-map"
import type { TripLogEntry } from "./state"

type IncidentEntry = Extract<TripLogEntry, { kind: "incident" }>
type PartEntry = Extract<TripLogEntry, { kind: "part-installed" }>

/** One line per incident step, shared by the Trip tab log and the room export. */
export function describeIncident(entry: IncidentEntry): string {
  const spec = INCIDENTS[entry.incident]
  switch (entry.step) {
    case "started":
      return `${spec.emoji} ${spec.name}`
    case "immune":
      return `${spec.emoji} ${spec.name} shrugged off by Road-Grip Tires`
    case "resolved": {
      const by = entry.resolvedBy
      const item = by ? (vanConsumable(by.itemId.split(":").pop() ?? "")?.name ?? "an item") : ""
      return by ? `${spec.emoji} ${by.name} used ${item}` : `${spec.emoji} ${spec.name} resolved`
    }
    case "aaa":
      return `💳 ${entry.resolvedBy?.name ?? "Someone"}'s AAA card covered it`
    case "towed":
      return `🚚 Towed ${(entry.miles ?? 0).toFixed(1)} mi to ${entry.siteName ?? "the mechanic"}`
    case "skipped":
      return `⏭ Host skipped a ${spec.name.toLowerCase()} step`
    case "cleared":
      return entry.incident === "out-of-gas"
        ? `${spec.emoji} Refuelled by the fuel truck`
        : `${spec.emoji} ${spec.name} cleared`
  }
}

export function describePartInstalled(entry: PartEntry): string {
  const part = vanPart(entry.partId)
  const replaced = entry.replaced ? ` (replaced the ${entry.replaced})` : ""
  return `${part?.emoji ?? "🔧"} ${entry.name} installed ${part?.name ?? entry.partId}${replaced}`
}

/** Van events for the Trip tab log: part installs and incident steps. */
export function describeVanEvent(entry: TripLogEntry): string | null {
  if (entry.kind === "incident") return describeIncident(entry)
  if (entry.kind === "part-installed") return describePartInstalled(entry)
  return null
}
