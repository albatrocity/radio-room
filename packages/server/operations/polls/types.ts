export type PollOperationError = {
  status: number
  error: string
  message: string
}

export type PollOperationFailure = { ok: false; error: PollOperationError }
