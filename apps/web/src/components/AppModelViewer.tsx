import type { ComponentProps } from "react"
import { ModelViewer } from "@repo/model-viewer"
import { useAnimationsEnabled } from "../hooks/useReducedMotion"

/** `ModelViewer` with the thumbnail spin tied to reduced motion (OS or in-app toggle). */
export default function AppModelViewer(props: Omit<ComponentProps<typeof ModelViewer>, "spin">) {
  const spin = useAnimationsEnabled()
  return <ModelViewer {...props} spin={spin} />
}
