import { CheckIcon } from "@chakra-ui/icons"
import { Button, HStack } from "@chakra-ui/react"
import React from "react"
import { useAdminStore } from "../../../state/adminStore"

type Props = {
  onCancel: () => void
  onSubmit: () => void
}

const FormActions = ({ onSubmit, onCancel }: Props) => {
  const { state: adminState } = useAdminStore()
  return (
    <HStack spacing={2}>
      <Button variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button
        type="submit"
        disabled={!adminState.matches("fetched.untouched")}
        rightIcon={
          adminState.matches("fetched.successful") ? (
            <CheckIcon color="green.500" />
          ) : undefined
        }
        onClick={onSubmit}
      >
        Submit
      </Button>
    </HStack>
  )
}

export default FormActions
