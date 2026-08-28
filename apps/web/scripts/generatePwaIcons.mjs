/**
 * Generate home-screen / maskable PNGs from the padded teal mark.
 *
 * Usage: npm run generate:icons -w web
 *
 * "any" / Apple icons keep ~17% inset so iOS rounded-rect masks do not clip the
 * mark. Maskable icons use ~22% inset so the mark stays in the 80% safe circle.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const sharp = require("sharp")

const __dirname = dirname(fileURLToPath(import.meta.url))
const webRoot = join(__dirname, "..")
const publicDir = join(webRoot, "public")
const iconsDir = join(publicDir, "icons")
const logoPath = join(publicDir, "favicon.svg")

const BRAND_TEAL = "#0093A5"
const ANY_LOGO_RATIO = 0.66
const MASKABLE_LOGO_RATIO = 0.56

const ANY_SIZES = [48, 72, 96, 144, 180, 192, 256, 384, 512]
const MASKABLE_SIZES = [192, 512]

async function renderMark(svg, logoPx) {
  const markSvg = svg.replace(/<rect width="320" height="320" fill="#0093A5"\/>/, "")
  return sharp(Buffer.from(markSvg)).resize(logoPx, logoPx).png().toBuffer()
}

async function renderIcon(svg, size, logoRatio) {
  const logoPx = Math.round(size * logoRatio)
  const logo = await renderMark(svg, logoPx)
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: BRAND_TEAL,
    },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toBuffer()
}

async function main() {
  await mkdir(iconsDir, { recursive: true })
  const svg = await readFile(logoPath, "utf8")

  for (const size of ANY_SIZES) {
    const png = await renderIcon(svg, size, ANY_LOGO_RATIO)
    await writeFile(join(iconsDir, `icon-${size}x${size}.png`), png)
  }

  for (const size of MASKABLE_SIZES) {
    const png = await renderIcon(svg, size, MASKABLE_LOGO_RATIO)
    await writeFile(join(iconsDir, `icon-${size}x${size}-maskable.png`), png)
  }

  await writeFile(join(publicDir, "apple-touch-icon.png"), await readFile(join(iconsDir, "icon-180x180.png")))
  await writeFile(join(publicDir, "icon.png"), await readFile(join(iconsDir, "icon-192x192.png")))
  await writeFile(join(publicDir, "favicon-32x32.png"), await renderIcon(svg, 32, ANY_LOGO_RATIO))

  console.log(
    `Wrote ${ANY_SIZES.length} any-purpose icons, ${MASKABLE_SIZES.length} maskable icons, apple-touch-icon, icon.png, favicon-32x32`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
