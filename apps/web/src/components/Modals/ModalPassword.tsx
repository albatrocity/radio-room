import React from "react"
import FormPassword from "../FormPassword"
import { useAuthStore } from "../../state/authStore"

function ModalPassword() {
  const { send: authSend } = useAuthStore()
  const isUnauthorized = useAuthStore((s) => s.state.matches("unauthorized"))
  const passwordError = useAuthStore((s) => s.state.context.passwordError)

  return (
    <FormPassword
      isOpen={isUnauthorized}
      error={passwordError}
      onSubmit={(password) => {
        authSend({
          type: "SET_PASSWORD",
          data: password,
        })
      }}
    />
  )
}

export default ModalPassword
