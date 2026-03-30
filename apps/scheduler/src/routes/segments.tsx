import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { zodSearchValidator } from "@tanstack/router-zod-adapter"
import { zStringArray } from "../lib/searchParams"
import { SegmentKanban } from "../components/segments/SegmentKanban"
import { ManagedOverflowContainer } from "../components/layout/ManagedOverflowContainer"

const segmentsSearchSchema = z.object({
  tags: zStringArray,
  segmentId: z.string().optional(),
})

export const Route = createFileRoute("/segments")({
  validateSearch: zodSearchValidator(segmentsSearchSchema),
  component: SegmentsPage,
})

function SegmentsPage() {
  return (
    <ManagedOverflowContainer>
      <SegmentKanban />
    </ManagedOverflowContainer>
  )
}
