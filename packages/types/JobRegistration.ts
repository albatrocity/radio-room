import { SimpleCache } from "./SimpleCache"

export type JobRegistration = {
  name: string
  description: string
  cron: string
  handler: ({ cache }: { cache: SimpleCache }) => Promise<void>
  enabled: boolean
  runAt: number
}
