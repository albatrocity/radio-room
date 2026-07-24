import { assign, fromPromise, setup } from "xstate"
import type { ConfigImportMode } from "@repo/types/Plugin"

export type ConfigImportApplyResult = {
  success: boolean
  value?: unknown
  message?: string
}

export type ConfigImportMachineContext = {
  rawText: string
  confirmReplace: boolean
  /** Set when SUBMIT proceeds (or after replace confirm). */
  pendingMode: ConfigImportMode | null
  pendingRun: (() => Promise<ConfigImportApplyResult>) | null
  /** Last successful apply result — read by `reportSuccess` before reset. */
  lastResult: ConfigImportApplyResult | null
  /** Last apply error message — read by `reportError`. */
  lastError: string | null
}

export type ConfigImportMachineEvent =
  | { type: "OPEN" }
  | { type: "CLOSE" }
  | { type: "SET_TEXT"; rawText: string }
  | {
      type: "SUBMIT"
      mode: ConfigImportMode
      /** When true, first replace click only arms confirm; second click submits. */
      needsReplaceConfirm: boolean
      run: () => Promise<ConfigImportApplyResult>
    }

const applyImportLogic = fromPromise<
  ConfigImportApplyResult,
  { run: () => Promise<ConfigImportApplyResult> }
>(async ({ input }) => {
  const result = await input.run()
  if (!result.success) {
    throw new Error(result.message || "Import failed")
  }
  return result
})

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return "Import failed"
}

export const configImportMachine = setup({
  types: {
    context: {} as ConfigImportMachineContext,
    events: {} as ConfigImportMachineEvent,
  },
  actors: {
    applyImport: applyImportLogic,
  },
  guards: {
    needsReplaceConfirm: ({ event }) =>
      event.type === "SUBMIT" && event.mode === "replace" && event.needsReplaceConfirm,
  },
  actions: {
    resetForm: assign({
      rawText: "",
      confirmReplace: false,
      pendingMode: null,
      pendingRun: null,
      lastResult: null,
      lastError: null,
    }),
    setText: assign(({ event }) => {
      if (event.type !== "SET_TEXT") return {}
      return { rawText: event.rawText, confirmReplace: false }
    }),
    armReplaceConfirm: assign(({ event }) => {
      if (event.type !== "SUBMIT") return {}
      return {
        confirmReplace: true,
        pendingMode: event.mode,
        pendingRun: event.run,
      }
    }),
    stageSubmit: assign(({ event }) => {
      if (event.type !== "SUBMIT") return {}
      return {
        confirmReplace: false,
        pendingMode: event.mode,
        pendingRun: event.run,
        lastError: null,
      }
    }),
    /** Capture invoke output — id-based done event types are not stable across XState versions. */
    captureResult: assign(({ event }) => {
      if (!("output" in event)) return {}
      return { lastResult: (event as { output: ConfigImportApplyResult }).output }
    }),
    captureError: assign(({ event }) => {
      if (!("error" in event)) return {}
      return { lastError: errorMessage((event as { error: unknown }).error) }
    }),
    /**
     * Host provides via `.provide({ actions: { reportSuccess } })`.
     * Reads `context.lastResult` (set by `captureResult`).
     */
    reportSuccess: () => {},
    /**
     * Host provides via `.provide({ actions: { reportError } })`.
     * Reads `context.lastError` (set by `captureError`).
     */
    reportError: () => {},
  },
}).createMachine({
  id: "configImport",
  initial: "closed",
  context: {
    rawText: "",
    confirmReplace: false,
    pendingMode: null,
    pendingRun: null,
    lastResult: null,
    lastError: null,
  },
  states: {
    closed: {
      on: {
        OPEN: { target: "open", actions: "resetForm" },
      },
    },
    open: {
      on: {
        CLOSE: { target: "closed", actions: "resetForm" },
        SET_TEXT: { actions: "setText" },
        SUBMIT: [
          { guard: "needsReplaceConfirm", actions: "armReplaceConfirm" },
          { target: "submitting", actions: "stageSubmit" },
        ],
      },
    },
    submitting: {
      invoke: {
        id: "applyImport",
        src: "applyImport",
        input: ({ context }) => ({
          run: context.pendingRun ?? (async () => ({ success: false, message: "Nothing to run" })),
        }),
        onDone: {
          target: "closed",
          // capture → report (reads context) → reset
          actions: ["captureResult", "reportSuccess", "resetForm"],
        },
        onError: {
          target: "open",
          actions: [
            "captureError",
            "reportError",
            assign({ pendingMode: null, pendingRun: null }),
          ],
        },
      },
    },
  },
})
