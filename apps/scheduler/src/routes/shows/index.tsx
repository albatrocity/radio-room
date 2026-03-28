import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { zodSearchValidator } from "@tanstack/router-zod-adapter"
import { ShowList } from "../../components/shows/ShowList"

const showListSearchSchema = z.object({
  search: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(["draft", "ready", "published"]).optional(),
  startTimeOrder: z.enum(["asc", "desc"]).default("asc"),
})

export const Route = createFileRoute("/shows/")({
  validateSearch: zodSearchValidator(showListSearchSchema),
  component: ShowsPage,
})

function ShowsPage() {
  return <ShowList />
}
