/**
 * What’s New Actor — bundled changelog + unread attention (ADR 0177).
 */

import { createActor } from "xstate"
import { whatsNewMachine } from "../machines/whatsNewMachine"

export const whatsNewActor = createActor(whatsNewMachine).start()

export function getWhatsNewMonths() {
  return whatsNewActor.getSnapshot().context.months
}

export function getLatestWhatsNewMonthId() {
  return whatsNewActor.getSnapshot().context.latestMonthId
}
