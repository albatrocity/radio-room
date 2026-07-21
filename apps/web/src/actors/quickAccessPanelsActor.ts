/**
 * Quick Access Panels Actor
 *
 * Room-scoped open set for admin Quick Access FloatingPanels (ADR 0074).
 * Send ACTIVATE { roomId } on room entry, DEACTIVATE on room exit (see roomLifecycle).
 */

import { createActor } from "xstate"
import { quickAccessPanelsMachine } from "../machines/quickAccessPanelsMachine"

export const quickAccessPanelsActor = createActor(quickAccessPanelsMachine).start()
