import React from "react"
import { useSelector } from "@xstate/react"
import FormPassword from "../FormPassword"
import useGlobalContext from "../useGlobalContext"
import { authMachine } from "../../machines/authMachine"
import { ActorRefFrom } from "xstate"

const isUnauthorizedSelector = (
  state: ActorRefFrom<typeof authMachine>["state"],
) => state.matches("unauthorized")
const passwordErrorSelector = (
  state: ActorRefFrom<typeof authMachine>["state"],
) => state.context.passwordError

function ModalPassword() {
  const globalServices = useGlobalContext()
  const isUnauthorized = useSelector(
    globalServices.authService,
    isUnauthorizedSelector,
  )
  const passwordError = useSelector(
    globalServices.authService,
    passwordErrorSelector,
  )

  return (
    <FormPassword
      isOpen={isUnauthorized}
      error={passwordError}
      onSubmit={(password) => {
        globalServices.authService.send({
          type: "SET_PASSWORD",
          data: password,
        })
      }}
    />
  )
}

export default ModalPassword
