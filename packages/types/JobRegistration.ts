import { Cache } from "./Cache"

export type JobRegistration = {
  name: string
  description: string
  cron: string
  handler: ({ cache }: { cache: Cache }) => Promise<void>
  enabled: boolean
  runAt: number
}
