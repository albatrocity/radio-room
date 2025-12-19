import { AppTheme } from "../types/AppTheme"

/**
 * Dynamic Theme
 *
 * This theme serves as a placeholder/fallback for the dynamic theme feature.
 * When selected, the app extracts colors from the currently playing album artwork
 * and applies them as CSS custom properties.
 *
 * These neutral colors are used when no artwork is available or colors
 * cannot be extracted.
 */
const theme: AppTheme = {
  id: "dynamic",
  name: "Dynamic (album artwork)",
  colors: {
    // Neutral slate grays for primary
    primary: {
      50: "#f8fafc",
      100: "#f1f5f9",
      200: "#e2e8f0",
      300: "#cbd5e1",
      400: "#94a3b8",
      500: "#64748b",
      600: "#475569",
      700: "#334155",
      800: "#1e293b",
      900: "#0f172a",
    },
    // Slightly cooler grays for secondary
    secondary: {
      50: "#f9fafb",
      100: "#f3f4f6",
      200: "#e5e7eb",
      300: "#d1d5db",
      400: "#9ca3af",
      500: "#6b7280",
      600: "#4b5563",
      700: "#374151",
      800: "#1f2937",
      900: "#111827",
    },
    // Teal accent for action (used until artwork provides colors)
    action: {
      50: "#f0fdfa",
      100: "#ccfbf1",
      200: "#99f6e4",
      300: "#5eead4",
      400: "#2dd4bf",
      500: "#14b8a6",
      600: "#0d9488",
      700: "#0f766e",
      800: "#115e59",
      900: "#134e4a",
    },
  },
}

export default theme
