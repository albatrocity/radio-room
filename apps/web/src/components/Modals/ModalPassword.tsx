import React from "react"
import FormPassword from "../FormPassword"
import { useAuthSend, useAuthState, usePasswordError } from "../../hooks/useActors"

function ModalPassword() {
  const authSend = useAuthSend()
  const authState = useAuthState()
  const isUnauthorized = authState === "unauthorized"
  const passwordError = usePasswordError()

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
