const THEME_COLOR_META = "theme-color"
export const PRIMARY_SOLID_CSS_VAR = "--chakra-colors-primary-solid"

export function readPrimarySolidColor(
  root: { getPropertyValue: (name: string) => string } | CSSStyleDeclaration,
): string | null {
  const value = root.getPropertyValue(PRIMARY_SOLID_CSS_VAR).trim()
  return value || null
}

/** Safari often ignores in-place `content` updates; replace the node. */
export function applyBrowserThemeColor(color: string, doc: Document = document): void {
  const head = doc.head
  if (!head) return

  for (const el of [...head.querySelectorAll(`meta[name="${THEME_COLOR_META}"]`)]) {
    el.remove()
  }

  const meta = doc.createElement("meta")
  meta.setAttribute("name", THEME_COLOR_META)
  meta.setAttribute("content", color)
  head.appendChild(meta)
}

export function syncBrowserThemeColorFromCss(doc: Document = document): string | null {
  const view = doc.defaultView
  if (!view) return null
  const color = readPrimarySolidColor(view.getComputedStyle(doc.documentElement))
  if (!color) return null
  applyBrowserThemeColor(color, doc)
  return color
}
