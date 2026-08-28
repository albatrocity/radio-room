/**
 * Generate iOS apple-touch-startup-image PNGs and inject <link> tags into index.html.
 *
 * Usage: npm run generate:splash -w web
 *
 * sharp is available via colorthief (apps/web). Logo size is 192 CSS px × device pixel ratio
 * so the native splash matches the inline #app-splash in index.html. Canvas is
 * brand teal (#0093A5); the mark is yellow (#FEB216) on black.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const sharp = require("sharp")

const __dirname = dirname(fileURLToPath(import.meta.url))
const webRoot = join(__dirname, "..")
const splashDir = join(webRoot, "public/splash")
const logoPath = join(webRoot, "public/favicon.svg")
const indexPath = join(webRoot, "index.html")

const START_MARKER = "    <!-- apple-touch-startup-image:generated -->"
const END_MARKER = "    <!-- /apple-touch-startup-image:generated -->"

/** Unique CSS viewports (portrait) that iOS matches for apple-touch-startup-image. */
const DEVICES = [
  { width: 440, height: 956, ratio: 3 },
  { width: 420, height: 912, ratio: 3 },
  { width: 430, height: 932, ratio: 3 },
  { width: 402, height: 874, ratio: 3 },
  { width: 393, height: 852, ratio: 3 },
  { width: 390, height: 844, ratio: 3 },
  { width: 428, height: 926, ratio: 3 },
  { width: 375, height: 812, ratio: 3 },
  { width: 414, height: 896, ratio: 3 },
  { width: 414, height: 896, ratio: 2 },
  { width: 414, height: 736, ratio: 3 },
  { width: 375, height: 667, ratio: 2 },
  { width: 320, height: 568, ratio: 2 },
  { width: 1024, height: 1366, ratio: 2 },
  { width: 834, height: 1194, ratio: 2 },
  { width: 820, height: 1180, ratio: 2 },
  { width: 810, height: 1080, ratio: 2 },
  { width: 768, height: 1024, ratio: 2 },
  { width: 744, height: 1133, ratio: 2 },
]

const LOGO_CSS_PX = 192
const SPLASH_BACKGROUND = "#0093A5"

function splashSpec(device, orientation) {
  const cssWidth = orientation === "portrait" ? device.width : device.height
  const cssHeight = orientation === "portrait" ? device.height : device.width
  const pixelWidth = cssWidth * device.ratio
  const pixelHeight = cssHeight * device.ratio
  return {
    ratio: device.ratio,
    pixelWidth,
    pixelHeight,
    file: `${pixelWidth}x${pixelHeight}.png`,
    media: `screen and (device-width: ${device.width}px) and (device-height: ${device.height}px) and (-webkit-device-pixel-ratio: ${device.ratio}) and (orientation: ${orientation})`,
  }
}

async function main() {
  await mkdir(splashDir, { recursive: true })

  const specs = DEVICES.flatMap((device) => [
    splashSpec(device, "portrait"),
    splashSpec(device, "landscape"),
  ])

  const logoByRatio = new Map()
  for (const ratio of new Set(DEVICES.map((device) => device.ratio))) {
    const size = LOGO_CSS_PX * ratio
    logoByRatio.set(ratio, await sharp(logoPath).resize(size, size).png().toBuffer())
  }

  const written = new Set()
  for (const spec of specs) {
    if (written.has(spec.file)) continue
    written.add(spec.file)
    const png = await sharp({
      create: {
        width: spec.pixelWidth,
        height: spec.pixelHeight,
        channels: 3,
        background: SPLASH_BACKGROUND,
      },
    })
      .composite([{ input: logoByRatio.get(spec.ratio), gravity: "centre" }])
      .png({ compressionLevel: 9, palette: true })
      .toBuffer()
    await writeFile(join(splashDir, spec.file), png)
  }

  const links = specs
    .map(
      (spec) =>
        `    <link rel="apple-touch-startup-image" media="${spec.media}" href="/splash/${spec.file}" />`,
    )
    .join("\n")

  const indexHtml = await readFile(indexPath, "utf8")
  const start = indexHtml.indexOf(START_MARKER)
  const end = indexHtml.indexOf(END_MARKER)
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Missing ${START_MARKER} / ${END_MARKER} markers in index.html`)
  }
  const next =
    indexHtml.slice(0, start + START_MARKER.length) + "\n" + links + "\n" + indexHtml.slice(end)
  await writeFile(indexPath, next)

  console.log(`Wrote ${written.size} splash PNGs and ${specs.length} <link> tags`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
