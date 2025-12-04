import { toaster } from "../components/ui/toaster"

type ToastOptions = {
  title?: string
  description?: React.ReactNode
  type?: "success" | "error" | "warning" | "info" | "loading"
  duration?: number
  status?: "success" | "error" | "warning" | "info"
}

export function toast(options: ToastOptions) {
  // Map legacy 'status' prop to 'type' for backwards compatibility
  const type = options.type || options.status || "info"
  
  return toaster.create({
    title: options.title,
    description: options.description,
    type,
    duration: options.duration ?? 5000,
    meta: {
      closable: true,
    },
  })
}

export { toaster }
