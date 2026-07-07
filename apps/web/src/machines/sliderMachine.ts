import { setup, assign } from "xstate"

export interface SliderContext {
  /** Display value shown on the thumb */
  displayValue: number
  /** Last value we dispatched (held during pending confirmation) */
  pendingValue: number | null
  /** External store value (synced from props) */
  externalValue: number
}

export type SliderEvent =
  | { type: "DRAG"; value: number }
  | { type: "RELEASE"; value: number }
  | { type: "SYNC_EXTERNAL"; value: number }

export interface SliderInput {
  initialValue: number
  onCommit: (value: number) => void
}

/**
 * State machine for controlled slider components with optimistic updates.
 *
 * States:
 * - `idle`: Display = external store value. Syncs when external changes.
 * - `dragging`: Display = drag value. External changes ignored until release.
 * - `pendingConfirmation`: Display = our committed value. Waits for external
 *   to match (server confirmed) or times out after 2s.
 *
 * This differs from `debouncedInputMachine` because sliders are controlled
 * components that need optimistic UI during the async server round-trip.
 */
export function createSliderMachine(onCommit: (value: number) => void) {
  return setup({
    types: {
      context: {} as SliderContext,
      events: {} as SliderEvent,
      input: {} as { initialValue: number },
    },
    actions: {
      setDragValue: assign({
        displayValue: ({ event }) => (event as { type: "DRAG"; value: number }).value,
      }),
      commitValue: assign({
        pendingValue: ({ event }) => (event as { type: "RELEASE"; value: number }).value,
        displayValue: ({ event }) => (event as { type: "RELEASE"; value: number }).value,
      }),
      dispatchCommit: ({ context }) => {
        if (context.pendingValue !== null) {
          onCommit(context.pendingValue)
        }
      },
      syncExternal: assign({
        externalValue: ({ event }) => (event as { type: "SYNC_EXTERNAL"; value: number }).value,
        displayValue: ({ event }) => (event as { type: "SYNC_EXTERNAL"; value: number }).value,
        pendingValue: null,
      }),
      acceptExternalInPending: assign({
        externalValue: ({ event }) => (event as { type: "SYNC_EXTERNAL"; value: number }).value,
        displayValue: ({ event }) => (event as { type: "SYNC_EXTERNAL"; value: number }).value,
        pendingValue: null,
      }),
      clearPending: assign({
        pendingValue: null,
      }),
    },
    guards: {
      externalMatchesPending: ({ context, event }) => {
        if (event.type !== "SYNC_EXTERNAL") return false
        return context.pendingValue !== null && event.value === context.pendingValue
      },
    },
  }).createMachine({
    id: "slider",
    initial: "idle",
    context: ({ input }) => ({
      displayValue: input.initialValue,
      pendingValue: null,
      externalValue: input.initialValue,
    }),
    states: {
      idle: {
        on: {
          DRAG: {
            target: "dragging",
            actions: ["setDragValue"],
          },
          SYNC_EXTERNAL: {
            actions: ["syncExternal"],
          },
        },
      },
      dragging: {
        on: {
          DRAG: {
            actions: ["setDragValue"],
          },
          RELEASE: {
            target: "pendingConfirmation",
            actions: ["commitValue", "dispatchCommit"],
          },
          // Ignore external updates while dragging — user interaction takes priority
        },
      },
      pendingConfirmation: {
        on: {
          DRAG: {
            target: "dragging",
            actions: ["setDragValue"],
          },
          SYNC_EXTERNAL: [
            {
              guard: "externalMatchesPending",
              target: "idle",
              actions: ["acceptExternalInPending"],
            },
            // External doesn't match our pending — ignore it (stale update or different source)
          ],
        },
        after: {
          // Timeout: if server hasn't confirmed in 2s, accept current external and go idle
          2000: {
            target: "idle",
            actions: ["clearPending"],
          },
        },
      },
    },
  })
}
