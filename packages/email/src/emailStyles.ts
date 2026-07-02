/** Shared typography and color tokens for newsletter markdown + template chrome. */
export const EMAIL_STYLES = {
  colors: {
    light: {
      text: "#24292e",
      heading: "#1a1a1a",
      link: "#556cd6",
      muted: "#8898aa",
      codeBg: "#f6f8fa",
      codeBorder: "#e1e4e8",
      blockquoteBorder: "#dfe2e5",
      hr: "#e6ebf1",
      bg: "#ffffff",
      containerBg: "#f6f9fc",
    },
    dark: {
      text: "#e6edf3",
      heading: "#f0f6fc",
      link: "#79c0ff",
      muted: "#8b949e",
      codeBg: "#161b22",
      codeBorder: "#3d444d",
      blockquoteBorder: "#3d444d",
      hr: "#3d444d",
      bg: "#0d1117",
      containerBg: "#010409",
    },
  },
  fonts: {
    base: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
    mono: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
  },
  sizes: {
    h1: "24px",
    h2: "20px",
    h3: "18px",
    h4: "16px",
    h5: "14px",
    h6: "14px",
    body: "16px",
    code: "14px",
    footer: "12px",
    brandHeading: "20px",
  },
  spacing: {
    paragraphMargin: "16px 0",
    headingMargin: {
      h1: "24px 0 16px",
      h2: "20px 0 12px",
      h3: "18px 0 10px",
      h4: "16px 0 8px",
      h5: "14px 0 8px",
      h6: "14px 0 8px",
    },
    listMargin: "16px 0",
    listPadding: "0 0 0 24px",
    listItemMargin: "4px 0",
    blockquoteMargin: "16px 0",
    blockquotePadding: "0 16px",
    codeBlockPadding: "16px",
    codeBlockMargin: "16px 0",
    hrMargin: "24px 0",
    containerPadding: "24px",
    containerBottom: "64px",
    brandHeadingMargin: "0 0 16px",
    footerLineHeight: "18px",
  },
  lineHeight: {
    body: "1.6",
    code: "1.45",
    footer: "18px",
  },
  layout: {
    maxWidth: "600px",
    borderRadius: "8px",
  },
} as const

export type EmailColorScheme = keyof typeof EMAIL_STYLES.colors

/** CSS injected into the email head for dark-mode overrides. */
export function buildEmailDarkModeCss(): string {
  const { dark } = EMAIL_STYLES.colors

  return `
    @media (prefers-color-scheme: dark) {
      .email-body { background-color: ${dark.containerBg} !important; }
      .email-container { background-color: ${dark.bg} !important; }
      .email-brand-heading { color: ${dark.heading} !important; }
      .email-text { color: ${dark.text} !important; }
      .email-heading { color: ${dark.heading} !important; }
      .email-link { color: ${dark.link} !important; }
      .email-muted { color: ${dark.muted} !important; }
      .email-code { background-color: ${dark.codeBg} !important; border-color: ${dark.codeBorder} !important; color: ${dark.text} !important; }
      .email-blockquote { border-color: ${dark.blockquoteBorder} !important; color: ${dark.muted} !important; }
      .email-hr { border-color: ${dark.hr} !important; }
    }
    [data-ogsc] .email-body { background-color: ${dark.containerBg} !important; }
    [data-ogsc] .email-container { background-color: ${dark.bg} !important; }
    [data-ogsc] .email-brand-heading { color: ${dark.heading} !important; }
    [data-ogsc] .email-text { color: ${dark.text} !important; }
    [data-ogsc] .email-heading { color: ${dark.heading} !important; }
    [data-ogsc] .email-link { color: ${dark.link} !important; }
    [data-ogsc] .email-muted { color: ${dark.muted} !important; }
    [data-ogsc] .email-code { background-color: ${dark.codeBg} !important; border-color: ${dark.codeBorder} !important; color: ${dark.text} !important; }
    [data-ogsc] .email-blockquote { border-color: ${dark.blockquoteBorder} !important; color: ${dark.muted} !important; }
    [data-ogsc] .email-hr { border-color: ${dark.hr} !important; }
  `.trim()
}

/** Minimal reset for markdown content inside the email body. */
export function buildEmailContentResetCss(): string {
  return `
    .email-content { margin: 0; padding: 0; }
    .email-content p:first-child,
    .email-content h1:first-child,
    .email-content h2:first-child,
    .email-content h3:first-child,
    .email-content h4:first-child,
    .email-content h5:first-child,
    .email-content h6:first-child,
    .email-content ul:first-child,
    .email-content ol:first-child,
    .email-content blockquote:first-child,
    .email-content pre:first-child { margin-top: 0; }
    .email-content img { max-width: 100%; height: auto; display: block; }
  `.trim()
}
