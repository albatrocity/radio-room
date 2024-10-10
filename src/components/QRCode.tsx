import React from "react"
import { useMachine } from "@xstate/react"
import { useEffect } from "react"
import { qrCodeMachine } from "../machines/qrCodeMachine"

export function QRCode({ url }: { url: string }) {
  const [qrState, qrSend] = useMachine(qrCodeMachine)

  useEffect(() => {
    qrSend("GENERATE", { data: url })
  }, [url])

  return (
    <div>
      {qrState.matches("success") && qrState.context.qrCode && (
        <img src={qrState.context.qrCode} />
      )}
    </div>
  )
}
