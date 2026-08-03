/**
 * Effective metadata sources actor (ADR 0088 / 0089 / 0090).
 * Room-scoped: ACTIVATE on room enter, DEACTIVATE on leave.
 */

import { createActor } from "xstate"
import { effectiveMetadataSourcesMachine } from "../machines/effectiveMetadataSourcesMachine"

export const effectiveMetadataSourcesActor = createActor(effectiveMetadataSourcesMachine).start()

export function refreshEffectiveMetadataSources(): void {
  effectiveMetadataSourcesActor.send({ type: "REFRESH" })
}
