import { JobApi } from "./JobApi"
import { AppContext } from "./AppContext"

export type JobRegistration = {
  name: string
  description: string
  cron: string
  handler: (params: { api: JobApi; context: AppContext }) => Promise<void>
  enabled: boolean
  runAt: number
}
