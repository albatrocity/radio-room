import type { SegmentDTO, SchedulingAdminUserDTO } from "@repo/types"
import { AssigneePicker } from "../assignee/AssigneePicker"
import { useSchedulingAdmins } from "../../hooks/useSchedulingAdmins"
import { useUpdateSegment } from "../../hooks/useSegments"

interface SegmentAssigneePickerProps {
  segment: SegmentDTO
  readOnly?: boolean
}

export function SegmentAssigneePicker({ segment, readOnly = false }: SegmentAssigneePickerProps) {
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
      disabled={readOnly}
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
