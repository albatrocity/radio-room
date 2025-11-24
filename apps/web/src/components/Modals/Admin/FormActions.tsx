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
    <HStack spacing={2}>
      <Button variant="outline" onClick={onCancel} isDisabled={isDeleting}>
        Cancel
      </Button>
      <Button
        type="submit"
        isDisabled={!dirty || isDeleting}
        isLoading={isDeleting}
        onClick={onSubmit}
      >
        Submit
      </Button>
    </HStack>
  )
}

export default FormActions
