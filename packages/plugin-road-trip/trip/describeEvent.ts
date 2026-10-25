import { INCIDENT_PRESETS, isIncidentPresetId, vanConsumable, vanPart } from "@repo/road-trip-map"
import type { TripLogEntry } from "./state"

type IncidentEntry = Extract<TripLogEntry, { kind: "incident" }>
type PartEntry = Extract<TripLogEntry, { kind: "part-installed" }>

/** The event's name and icon as logged; logs written before ADR 0220 fall back to the preset. */
function incidentLabel(entry: IncidentEntry): { name: string; icon: string } {
  const preset = isIncidentPresetId(entry.incident) ? INCIDENT_PRESETS[entry.incident] : undefined
  return {
    name: entry.name ?? preset?.name ?? entry.incident,
    icon: entry.icon ?? preset?.icon ?? "⚠️",
  }
}

/** One line per incident step, shared by the Trip tab log and the room export. */
export function describeIncident(entry: IncidentEntry): string {
  const { name, icon } = incidentLabel(entry)
  switch (entry.step) {
    case "started":
    case "noted":
      return `${icon} ${name}`
    case "immune": {
      const part = entry.partId ? vanPart(entry.partId)?.name : undefined
      return `${icon} ${name} shrugged off${part ? ` by ${part}` : ""}`
    }
    case "resolved": {
      const by = entry.resolvedBy
      const item = by ? (vanConsumable(by.itemId.split(":").pop() ?? "")?.name ?? "an item") : ""
      return by ? `${icon} ${by.name} used ${item}` : `${icon} ${name} resolved`
    }
    case "aaa":
      return `💳 ${entry.resolvedBy?.name ?? "Someone"}'s AAA card covered it`
    case "towed":
      return `🚚 Towed ${(entry.miles ?? 0).toFixed(1)} mi to ${entry.siteName ?? "the mechanic"}`
    case "skipped":
      return `⏭ Host skipped a ${name.toLowerCase()} step`
    case "cleared":
      return entry.refueled ? `${icon} Refuelled by the fuel truck` : `${icon} ${name} cleared`
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
