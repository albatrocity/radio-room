import React from "react"
import { useSelector } from "@xstate/react"
import FormPassword from "../FormPassword"
import useGlobalContext from "../useGlobalContext"

type Props = {}

const isUnauthorizedSelector = (state) => state.matches("unauthorized")
const passwordErrorSelector = (state) => state.context.passwordError

function ModalPassword({}: Props) {
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
