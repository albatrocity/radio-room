import { createMachine, assign } from "xstate"
import QRCode from "qrcode"

interface Context {
  qrCode: string | null
}

export const qrCodeMachine = createMachine<Context>(
  {
    predictableActionArguments: true,
    id: "qrCode",
    context: {
      qrCode: null,
    },
    on: {
      GENERATE: "generating",
    },
    initial: "inactive",
    states: {
      generating: {
        invoke: {
          id: "generateQrCode",
          src: async (_context, event) => {
            return QRCode.toDataURL(event.data, {
              width: 500,
            })
          },
          onError: {
            target: "failure",
          },
          onDone: {
            target: "success",
            actions: ["setQrCode"],
          },
        },
      },
      failure: {},
      success: {},
      inactive: {},
    },
  },
  {
    actions: {
      setQrCode: assign((_context, event) => {
        return {
          qrCode: event.data,
        }
      }),
    },
  },
)
