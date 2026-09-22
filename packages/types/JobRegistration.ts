import { JobApi } from "./JobApi"
import { AppContext } from "./AppContext"

export type JobRegistration = {
  name: string
  description: string
  cron: string
  handler: (params: { api: JobApi; context: AppContext }) => Promise<void>
  enabled: boolean
  runAt: number
  /**
   * When true, skip per-tick "Running job" logs (errors / overlap / missed still log).
   * Use for high-frequency jobs such as second-granularity sweeps.
   */
  quiet?: boolean
}
