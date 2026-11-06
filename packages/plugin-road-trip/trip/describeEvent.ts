import {
  GAS_CANISTER,
  INCIDENT_PRESETS,
  isIncidentPresetId,
  tripBook,
  vanConsumable,
  vanPart,
} from "@repo/road-trip-map"
import type { TripLogEntry } from "./state"

type IncidentEntry = Extract<TripLogEntry, { kind: "incident" }>
type PartEntry = Extract<TripLogEntry, { kind: "part-installed" }>
type BookEntry = Extract<TripLogEntry, { kind: "book-read" }>
type FuelEntry = Extract<TripLogEntry, { kind: "fuel" }>

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

export function describeBookRead(entry: BookEntry): string {
  const book = tripBook(entry.shortId)
  const title = book?.name ?? entry.shortId
  return entry.learned
    ? `${book?.emoji ?? "📖"} ${entry.name} read ${title}`
    : `${book?.emoji ?? "📖"} ${entry.name} read ${title} (it went over their head)`
}

export function describePour(entry: FuelEntry): string {
  const who = entry.name ? `${entry.name} poured` : "Poured"
  return `${GAS_CANISTER.emoji} ${who} ${entry.gallons.toFixed(1)} gal from a ${GAS_CANISTER.name}`
}

/** Van events for the Trip tab log: part installs, books, pours, and incident steps. */
export function describeVanEvent(entry: TripLogEntry): string | null {
  if (entry.kind === "incident") return describeIncident(entry)
  if (entry.kind === "part-installed") return describePartInstalled(entry)
  if (entry.kind === "book-read") return describeBookRead(entry)
  if (entry.kind === "fuel" && entry.level === "poured") return describePour(entry)
  return null
}
