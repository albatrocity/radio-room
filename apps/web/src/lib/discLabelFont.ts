import caveatLatin600 from "@fontsource/caveat/files/caveat-latin-600-normal.woff2?url"

/** Dedicated family name so SVG `<text>` always resolves the bundled face. */
export const DISC_LABEL_FONT_FAMILY = "DiscLabelCaveat"

/** Inline SVG styles: embed @font-face so disc labels render Caveat reliably. */
export const discLabelFontStyles = `
@font-face {
  font-family: '${DISC_LABEL_FONT_FAMILY}';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('${caveatLatin600}') format('woff2');
}
.disc-label-text {
  font-family: '${DISC_LABEL_FONT_FAMILY}', cursive;
  font-weight: 600;
}
`

/** Preload the disc-label face once per page load. */
export function loadDiscLabelFont(fontSize: number): Promise<FontFace[]> {
  return document.fonts.load(`600 ${fontSize}px ${DISC_LABEL_FONT_FAMILY}`)
}
