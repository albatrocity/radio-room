import { SimpleCache } from "./SimpleCache"
import { AppContext } from "./AppContext"

export type JobRegistration = {
  name: string
  description: string
  cron: string
  handler: ({ cache, context }: { cache: SimpleCache; context: AppContext }) => Promise<void>
  enabled: boolean
  runAt: number
}
