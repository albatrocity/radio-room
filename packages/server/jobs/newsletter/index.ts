import type { AppContext } from "@repo/types"
import { processDueScheduledIssues } from "../../services/NewsletterService"

export default async function newsletterScheduledJob({
  context,
}: {
  api: unknown
  context: AppContext
}) {
  await processDueScheduledIssues(context)
}
