import type { SegmentDTO, SchedulingAdminUserDTO } from "@repo/types"
import { AssigneePicker } from "../assignee/AssigneePicker"
import { useSchedulingAdmins } from "../../hooks/useSchedulingAdmins"
import { useUpdateSegment } from "../../hooks/useSegments"

interface SegmentAssigneePickerProps {
  segment: SegmentDTO
}

export function SegmentAssigneePicker({ segment }: SegmentAssigneePickerProps) {
  const { data: admins = [], isPending: adminsLoading } = useSchedulingAdmins()
  const updateSegment = useUpdateSegment()

  const isSaving =
    updateSegment.isPending && updateSegment.variables?.id === segment.id

  return (
    <AssigneePicker<SchedulingAdminUserDTO>
      entityLabel="segment"
      assignedUserId={segment.assignedTo}
      assignee={segment.assignee}
      candidateUsers={admins}
      adminsLoading={adminsLoading}
      isSaving={isSaving}
      onAssign={(user) =>
        updateSegment.mutate({
          id: segment.id,
          assignedTo: user.id,
          optimisticAssignee: user,
        })
      }
      onUnassign={() => updateSegment.mutate({ id: segment.id, assignedTo: null })}
    />
  )
}
