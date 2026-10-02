import { useEffect, useRef, useState, type ReactNode } from "react"
import { Box } from "@chakra-ui/react"
import type { ModelSceneHandle, ModelSceneMode } from "./modelScene"

type Props = {
  src: string
  alt: string
  /** `thumbnail` spins with no input; `stage` orbits and zooms (ADR 0199). */
  mode: ModelSceneMode
  /** Thumbnail auto-rotation; pass false for reduced motion. Ignored on the stage. */
  spin: boolean
  /** Shown while the model loads and in place of it when loading or WebGL fails. */
  fallback: ReactNode
  /** Chakra box size token; omitted when the parent supplies the size (`stage`, feature slots). */
  boxSize?: number
}

const STAGE_LABEL = "Drag to rotate. Scroll or pinch to zoom."

/**
 * GLB viewer for item and site artwork (ADR 0205). `three` lives in `modelScene`,
 * loaded on mount so no app's main bundle carries it. Key by `src`: a failed
 * viewer stays on the fallback until it remounts.
 */
export function ModelViewer({ src, alt, mode, spin, fallback, boxSize }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const handleRef = useRef<ModelSceneHandle | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const spinRef = useRef(spin)
  spinRef.current = spin

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    let cancelled = false
    setStatus("loading")
    void import("./modelScene")
      .then(({ mountModelScene }) => {
        if (cancelled) return
        handleRef.current = mountModelScene(canvas, container, {
          src,
          mode,
          spin: spinRef.current,
          onLoad: () => {
            if (!cancelled) setStatus("ready")
          },
          onError: () => {
            if (!cancelled) setStatus("error")
          },
        })
      })
      .catch(() => {
        if (!cancelled) setStatus("error")
      })
    return () => {
      cancelled = true
      handleRef.current?.dispose()
      handleRef.current = null
    }
  }, [src, mode])

  useEffect(() => {
    handleRef.current?.setSpin(spin)
  }, [spin])

  useEffect(() => {
    if (status !== "error") return
    handleRef.current?.dispose()
    handleRef.current = null
  }, [status])

  if (status === "error") return <>{fallback}</>

  const isStage = mode === "stage"
  return (
    <Box
      ref={containerRef}
      position="relative"
      flexShrink={0}
      boxSize={boxSize}
      w={boxSize == null ? "100%" : undefined}
      aspectRatio={boxSize == null ? "1 / 1" : undefined}
      pointerEvents={isStage ? undefined : "none"}
    >
      {status === "loading" ? (
        <Box position="absolute" inset="0" display="flex" alignItems="center" justifyContent="center">
          {fallback}
        </Box>
      ) : null}
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={isStage ? `${alt}. ${STAGE_LABEL}` : alt}
        tabIndex={isStage ? 0 : -1}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          opacity: status === "ready" ? 1 : 0,
          cursor: isStage ? "grab" : undefined,
          touchAction: isStage ? "none" : undefined,
          outlineOffset: "2px",
        }}
      />
    </Box>
  )
}

export default ModelViewer
