import {
  Box3,
  Group,
  MathUtils,
  NeutralToneMapping,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Sphere,
  Vector3,
  WebGLRenderer,
  type Material,
  type Mesh,
  type Object3D,
  type Texture,
} from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"

export type ItemModelSceneMode = "thumbnail" | "stage"

export type ItemModelSceneOptions = {
  src: string
  mode: ItemModelSceneMode
  /** Thumbnail auto-rotation; ignored on the stage. */
  spin: boolean
  onLoad: () => void
  onError: () => void
}

export type ItemModelSceneHandle = {
  setSpin: (spin: boolean) => void
  dispose: () => void
}

const FIELD_OF_VIEW = 30
const SPIN_RADIANS_PER_SECOND = 0.6
const KEY_ROTATE_RADIANS = MathUtils.degToRad(15)
const KEY_ZOOM_FACTOR = 0.85
/** Slightly above the horizon so items read as objects on a table, not a flat profile. */
const CAMERA_ELEVATION = 0.25
const STAGE_MIN_ZOOM = 0.45
const STAGE_MAX_ZOOM = 2.5

function disposeObject(root: Object3D): void {
  root.traverse((node) => {
    const mesh = node as Mesh
    if (!mesh.isMesh) return
    mesh.geometry?.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials as Material[]) {
      for (const value of Object.values(material)) {
        if ((value as Texture | null)?.isTexture) (value as Texture).dispose()
      }
      material.dispose()
    }
  })
}

/**
 * Render one GLB into `canvas`, sized to `container` (ADR 0199). Thumbnails spin
 * with no input; the stage orbits and zooms with pointer, wheel, pinch, arrow keys,
 * and +/-. Returns a handle that tears down the WebGL context.
 */
export function mountItemModelScene(
  canvas: HTMLCanvasElement,
  container: HTMLElement,
  options: ItemModelSceneOptions,
): ItemModelSceneHandle {
  let disposed = false
  let spin = options.spin
  let frame = 0
  let needsRender = true
  let lastTime = performance.now()

  let renderer: WebGLRenderer
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true })
  } catch {
    queueMicrotask(options.onError)
    return { setSpin: () => {}, dispose: () => {} }
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.toneMapping = NeutralToneMapping

  const scene = new Scene()
  const pmrem = new PMREMGenerator(renderer)
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = environment

  const camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, 0.01, 100)
  const pivot = new Group()
  scene.add(pivot)

  const isStage = options.mode === "stage"
  const controls = isStage ? new OrbitControls(camera, canvas) : null
  if (controls) {
    controls.enablePan = false
    controls.enableDamping = true
    controls.addEventListener("change", () => {
      needsRender = true
    })
  }

  const resize = () => {
    const width = Math.max(1, container.clientWidth)
    const height = Math.max(1, container.clientHeight)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    needsRender = true
  }
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(container)
  resize()

  const zoomBy = (factor: number) => {
    if (!controls) return
    const offset = camera.position.clone().sub(controls.target)
    const distance = MathUtils.clamp(
      offset.length() * factor,
      controls.minDistance,
      controls.maxDistance,
    )
    camera.position.copy(controls.target).add(offset.setLength(distance))
    needsRender = true
  }

  const onKeyDown = (event: KeyboardEvent) => {
    switch (event.key) {
      case "ArrowLeft":
        pivot.rotation.y -= KEY_ROTATE_RADIANS
        break
      case "ArrowRight":
        pivot.rotation.y += KEY_ROTATE_RADIANS
        break
      case "ArrowUp":
        pivot.rotation.x = MathUtils.clamp(pivot.rotation.x - KEY_ROTATE_RADIANS, -1.2, 1.2)
        break
      case "ArrowDown":
        pivot.rotation.x = MathUtils.clamp(pivot.rotation.x + KEY_ROTATE_RADIANS, -1.2, 1.2)
        break
      case "+":
      case "=":
        zoomBy(KEY_ZOOM_FACTOR)
        break
      case "-":
      case "_":
        zoomBy(1 / KEY_ZOOM_FACTOR)
        break
      default:
        return
    }
    event.preventDefault()
    needsRender = true
  }
  if (isStage) canvas.addEventListener("keydown", onKeyDown)

  const onContextLost = (event: Event) => {
    event.preventDefault()
    if (!disposed) options.onError()
  }
  canvas.addEventListener("webglcontextlost", onContextLost)

  const tick = (now: number) => {
    frame = requestAnimationFrame(tick)
    const deltaSeconds = Math.min((now - lastTime) / 1000, 0.1)
    lastTime = now
    if (!isStage && spin) {
      pivot.rotation.y += SPIN_RADIANS_PER_SECOND * deltaSeconds
      needsRender = true
    }
    if (controls?.update()) needsRender = true
    if (needsRender) {
      renderer.render(scene, camera)
      needsRender = false
    }
  }

  new GLTFLoader().load(
    options.src,
    (gltf) => {
      if (disposed) {
        disposeObject(gltf.scene)
        return
      }
      const model = gltf.scene
      const bounds = new Box3().setFromObject(model)
      const center = bounds.getCenter(new Vector3())
      const radius = Math.max(bounds.getBoundingSphere(new Sphere()).radius, 0.001)
      model.position.sub(center)
      pivot.add(model)

      const fitDistance = (radius / Math.sin(MathUtils.degToRad(FIELD_OF_VIEW / 2))) * 1.05
      camera.position.set(0, fitDistance * CAMERA_ELEVATION, fitDistance)
      camera.near = fitDistance / 100
      camera.far = fitDistance * 100
      camera.lookAt(0, 0, 0)
      camera.updateProjectionMatrix()
      if (controls) {
        controls.target.set(0, 0, 0)
        controls.minDistance = fitDistance * STAGE_MIN_ZOOM
        controls.maxDistance = fitDistance * STAGE_MAX_ZOOM
        controls.update()
      }
      needsRender = true
      lastTime = performance.now()
      frame = requestAnimationFrame(tick)
      options.onLoad()
    },
    undefined,
    () => {
      if (!disposed) options.onError()
    },
  )

  return {
    setSpin(next) {
      spin = next
    },
    dispose() {
      if (disposed) return
      disposed = true
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      canvas.removeEventListener("keydown", onKeyDown)
      canvas.removeEventListener("webglcontextlost", onContextLost)
      controls?.dispose()
      disposeObject(pivot)
      environment.dispose()
      pmrem.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }
}
