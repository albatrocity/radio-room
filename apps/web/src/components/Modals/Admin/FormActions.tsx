import { Button, HStack } from "@chakra-ui/react"
import React from "react"
import { useIsDeleting } from "../../../hooks/useActors"

type Props = {
  onCancel: () => void
  onSubmit: () => void
  dirty?: boolean
}

const FormActions = ({ onSubmit, onCancel, dirty = false }: Props) => {
  const isDeleting = useIsDeleting()

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
