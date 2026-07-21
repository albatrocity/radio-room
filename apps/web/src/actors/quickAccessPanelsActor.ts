/**
 * Quick Access Panels Actor
 *
 * Room-scoped open set + desktop geometry for admin Quick Access FloatingPanels (ADR 0072).
 * Send ACTIVATE { roomId } on room entry, DEACTIVATE on room exit (see roomLifecycle).
 */

import { createActor } from "xstate"
import { quickAccessPanelsMachine } from "../machines/quickAccessPanelsMachine"

export const quickAccessPanelsActor = createActor(quickAccessPanelsMachine).start()

export function getQuickAccessPanels() {
  return quickAccessPanelsActor.getSnapshot().context.panels
}

export function getOpenQuickAccessPluginNames(): string[] {
  return Object.entries(quickAccessPanelsActor.getSnapshot().context.panels)
    .filter(([, panel]) => panel.open)
    .map(([name]) => name)
}
