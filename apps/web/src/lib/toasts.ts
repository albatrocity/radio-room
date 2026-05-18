import { toaster } from "../components/ui/toaster"

export const CONNECTION_STATUS_TOAST_ID = "connection-status"

type ToastOptions = {
  title?: string
  description?: React.ReactNode
  type?: "success" | "error" | "warning" | "info" | "loading"
  duration?: number | null
  status?: "success" | "error" | "warning" | "info"
  id?: string
  isClosable?: boolean
}

function resolveDuration(duration: number | null | undefined): number {
  if (duration === null) return Infinity
  if (duration === undefined) return 5000
  return duration
}

export function toast(options: ToastOptions) {
  // Map legacy 'status' prop to 'type' for backwards compatibility
  const type = options.type || options.status || "info"
  const closable = options.isClosable ?? true

  return toaster.create({
    ...(options.id != null ? { id: options.id } : {}),
    title: options.title,
    description: options.description,
    type,
    duration: resolveDuration(options.duration),
    meta: {
      closable,
    },
  })
}

export { toaster }
