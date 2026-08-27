import { useCallback } from "react"
import { useBreakpointValue } from "@chakra-ui/react"
import { useSelector } from "@xstate/react"

import { modalsActor } from "../actors/modalsActor"
import {
  type IntegratedPanelSlotId,
  type IntegratedPanelPresentation,
  integratedPanelToggleEvent,
  resolveActiveIntegratedPanelSlot,
  resolveIntegratedPanelSlot,
} from "../lib/integratedPanelSlots"
import { useModalsSend } from "./useActors"

export function useIntegratedPanelPresentation(): IntegratedPanelPresentation {
  return useBreakpointValue<IntegratedPanelPresentation>({ base: "modal", lg: "panel" }) ?? "modal"
}

/** Game State / Add to Queue use a bottom sheet below `lg` (panel is lg+). */
export function useIsBelowLg(): boolean {
  return useBreakpointValue({ base: true, lg: false }) ?? true
}

/** Playlist / listeners / schedule drawers become bottom sheets below `sm`. */
export function useIsBelowSm(): boolean {
  return useBreakpointValue({ base: true, sm: false }) ?? true
}

export function useActiveIntegratedPanelSlot(): IntegratedPanelSlotId | null {
  const presentation = useIntegratedPanelPresentation()
  return useSelector(modalsActor, (state) =>
    resolveActiveIntegratedPanelSlot(state, presentation),
  )
}

export function useIntegratedPanelToggle(slotId: IntegratedPanelSlotId) {
  const send = useModalsSend()
  const activeSlot = useActiveIntegratedPanelSlot()
  const isActive = activeSlot === slotId

  const toggle = useCallback(() => {
    send(integratedPanelToggleEvent(slotId, activeSlot))
  }, [send, slotId, activeSlot])

  return { isActive, toggle }
}

/** True when the modals state maps to this slot, regardless of panel vs modal presentation. */
export function useIsIntegratedPanelSlotOpen(slotId: IntegratedPanelSlotId): boolean {
  return useSelector(modalsActor, (state) => resolveIntegratedPanelSlot(state) === slotId)
}
