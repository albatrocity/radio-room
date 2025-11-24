import { useEffect } from "react"
import { useLocation, useNavigate } from "@tanstack/react-router"
import { UseToastOptions } from "@chakra-ui/react"
import { toast } from "../lib/toasts"

type LocationState = {
  toast?: UseToastOptions
}

function getStatus(status: string | null) {
  switch (status) {
    case "success":
      return "success"
    case "error":
      return "error"
    case "warning":
      return "warning"
    case "info":
      return "info"
    default:
      return "success"
  }
}

export default function AppToasts() {
  const navigate = useNavigate()
  const location = useLocation()
  const params = new URLSearchParams(location.search)

  useEffect(() => {
    if (params.get("toast")) {
      toast({
        title: params.get("toast"),
        status: getStatus(params.get("toastType")),
        description: params.get("toastDescription"),
        duration: 5000,
      })
      params.delete("toast")
      params.delete("toastType")
      params.delete("toastDescription")
      navigate({
        to: location.pathname,
        replace: true,
      })
    }

    if (location.state?.toast) {
      toast({
        title: location.state.toast.title,
        description: location.state.toast.description,
        status: location.state.toast.status,
        duration: 5000,
      })
      navigate({
        to: location.pathname,
        replace: true,
        state: (s) => ({ ...s, toast: undefined }),
      })
    }
  }, [])

  return null
}
