import { Button, HStack } from "@chakra-ui/react"
import React from "react"
import { useAdminStore } from "../../../state/adminStore"

type Props = {
  onCancel: () => void
  onSubmit: () => void
  dirty?: boolean
}

const FormActions = ({ onSubmit, onCancel, dirty = false }: Props) => {
  const { state: adminState } = useAdminStore()
  const isDeleting = adminState.matches("deleting")

  return (
    <HStack gap={2}>
      <Button variant="outline" onClick={onCancel} disabled={isDeleting}>
        Cancel
      </Button>
      <Button
        type="submit"
        disabled={!dirty || isDeleting}
        loading={isDeleting}
        onClick={onSubmit}
      >
        Submit
      </Button>
    </HStack>
  )
}

export default FormActions
